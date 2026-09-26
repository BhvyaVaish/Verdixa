import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import * as fs from "fs";
import * as path from "path";
import { createHmac } from "crypto";

const prisma = new PrismaClient();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.startsWith("CHANGE_ME")) {
    return "dev_only_not_for_production_change_this";
  }
  return secret;
}

function signDeterministic(rawToken: string): string {
  const hmac = createHmac("sha256", getSecret()).update(rawToken).digest("hex");
  return `${rawToken}.${hmac}`;
}

async function loadFixtures() {
  const fixturePath = path.join(process.cwd(), "tools", "acceptance", "fixtures.json");
  if (!fs.existsSync(fixturePath)) {
    console.log("[seed] No fixtures.json found. Skipping fixture import.");
    return;
  }
  
  console.log("[seed] Importing fixtures.json...");
  const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const passwordHash = await hashPassword("verdixa2026");

  // Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@verdixa.dev";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, role: Role.admin },
  });

  // Organizer
  const organizerId = "organizer-seed-uuid-1234";
  const orgTokenRaw = "sess_organizer";
  await prisma.user.upsert({
    where: { email: "organizer@verdixa.dev" },
    update: {},
    create: { id: organizerId, email: "organizer@verdixa.dev", passwordHash, role: Role.organizer },
  });
  await prisma.session.upsert({
    where: { token: orgTokenRaw },
    update: {},
    create: { userId: organizerId, token: orgTokenRaw, expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000) }
  });

  // Event
  let event = await prisma.event.findFirst();
  if (!event && data.event) {
    event = await prisma.event.create({
      data: {
        id: data.event.id,
        name: data.event.name,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        submissionDeadline: new Date(data.event.submissions_close),
        organizerId: organizerId,
        status: "closed",
      }
    });
    console.log(`[seed] Created event: ${event.name}`);
  }

  // Tracks
  for (const track of data.tracks || []) {
    await prisma.track.upsert({
      where: { id: track.id },
      update: {},
      create: { id: track.id, name: track.name, eventId: event!.id }
    });
  }

  // Judges
  for (const j of data.judges || []) {
    const rawToken = `sess_${j.id}`;
    const judgeUserId = `user_${j.id}`;
    const judgeUser = await prisma.user.upsert({
      where: { email: j.email },
      update: {},
      create: { id: judgeUserId, email: j.email, passwordHash, role: Role.judge },
    });
    await prisma.session.upsert({
      where: { token: rawToken },
      update: {},
      create: {
        userId: judgeUser.id,
        token: rawToken,
        expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
      }
    });
  }

  // Teams & Participants
  let participantUserId = null;
  const participantTokenRaw = "sess_participant";

  for (const t of data.teams || []) {
    const team = await prisma.team.upsert({
      where: { id: t.id },
      update: {},
      create: { id: t.id, name: t.name, eventId: event!.id }
    });

    for (const m of t.members || []) {
      const user = await prisma.user.upsert({
        where: { email: m.email },
        update: {},
        create: { email: m.email, passwordHash, role: Role.participant }
      });
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: user.id } },
        update: {},
        create: { teamId: team.id, userId: user.id }
      });

      // Assign the participant token to the very first member of the first team, or specifically participant@verdixa.dev
      if (m.email === "participant@verdixa.dev") {
        participantUserId = user.id;
        await prisma.session.upsert({
          where: { token: participantTokenRaw },
          update: {},
          create: { userId: user.id, token: participantTokenRaw, expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000) }
        });
      }
    }
  }

  // Projects
  for (const p of data.projects || []) {
    let duplicateOfId = undefined;
    
    // Check if this project is a duplicate
    if (p._duplicate_note) {
      console.log(`[seed] Detected deliberate duplicate submission: ${p.title} for team ${p.team_id}`);
      // Find the existing project with the same repoUrl
      const existing = await prisma.project.findFirst({
        where: { teamId: p.team_id, eventId: event!.id, repoUrl: p.repo_url }
      });
      if (existing) {
        duplicateOfId = existing.id;
        
        await prisma.auditLog.create({
          data: {
            actorId: organizerId,
            action: "DUPLICATE_SUBMISSION",
            entityType: "Project",
            entityId: p.id,
            payload: { message: p._duplicate_note, duplicateOf: duplicateOfId }
          }
        });
      }
    }
    
    await prisma.project.upsert({
      where: { id: p.id },
      update: { duplicateOf: duplicateOfId },
      create: {
        id: p.id,
        title: p.title,
        teamId: p.team_id,
        eventId: event!.id,
        trackId: p.track_id,
        repoUrl: p.repo_url,
        demoUrl: p.demo_url,
        status: "submitted",
        duplicateOf: duplicateOfId,
        submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Submitted yesterday
      }
    });
  }

  // Rubric
  const rubricId = "rubric_01";
  const rubric = await prisma.rubric.upsert({
    where: { id: rubricId },
    update: {},
    create: { id: rubricId, eventId: event!.id, version: 1, isActive: true }
  });

  const criteriaMap = new Map();
  const criteriaNames = ["functionality", "quality", "innovation"];
  for (const name of criteriaNames) {
    const criterion = await prisma.rubricCriterion.create({
      data: { rubricId: rubric.id, name, weight: 1.0, maxScore: 5 }
    });
    criteriaMap.set(name, criterion.id);
  }

  // AlgorithmRun
  const runId = "run_01";
  await prisma.algorithmRun.upsert({
    where: { id: runId },
    update: {},
    create: { id: runId, eventId: event!.id, rubricId: rubric.id, version: "1.0", seed: "fixture_seed" }
  });

  // Scores -> Assignments -> ScoreCards -> CriterionScores
  for (const s of data.scores || []) {
    const judgeUserId = `user_${s.judge_id}`;
    
    // Create assignment
    const assignment = await prisma.judgeAssignment.upsert({
      where: { judgeId_projectId: { judgeId: judgeUserId, projectId: s.project_id } },
      update: {},
      create: {
        judgeId: judgeUserId,
        projectId: s.project_id,
        eventId: event!.id,
        algorithmRun: runId
      }
    });

    // Create ScoreCard
    const scorecard = await prisma.scoreCard.upsert({
      where: { assignmentId: assignment.id },
      update: {},
      create: {
        judgeId: judgeUserId,
        projectId: s.project_id,
        assignmentId: assignment.id,
        rubricId: rubric.id,
        submittedAt: new Date()
      }
    });

    // Create CriterionScores
    for (const name of criteriaNames) {
      if (s[name] !== undefined) {
        await prisma.criterionScore.upsert({
          where: { scorecardId_criterionId: { scorecardId: scorecard.id, criterionId: criteriaMap.get(name) } },
          update: {},
          create: {
            scorecardId: scorecard.id,
            criterionId: criteriaMap.get(name),
            score: s[name]
          }
        });
      }
    }
  }

  // Output deterministic headers for `.dogfood.toml`
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│  VERDIXA — Seed complete                        │");
  console.log("│  Use these signed tokens in .dogfood.toml:      │");
  console.log("│  organizer: Cookie: verdixa_session=" + signDeterministic(orgTokenRaw));
  console.log("│  judge_a  : Cookie: verdixa_session=" + signDeterministic("sess_jdg_01"));
  console.log("│  judge_b  : Cookie: verdixa_session=" + signDeterministic("sess_jdg_07"));
  console.log("│  particpt : Cookie: verdixa_session=" + signDeterministic(participantTokenRaw));
  console.log("└─────────────────────────────────────────────────┘");
}

async function main() {
  await loadFixtures();
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
