import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Helper to construct a deterministic signed cookie value for acceptance testing.
// In reality, this logic must perfectly mirror `sign()` in `lib/auth/session.ts`
// but since we need deterministic tokens in seed, we just hardcode the token base.
// We will generate a raw token and manually compute its HMAC based on the SESSION_SECRET.
import { createHmac } from "crypto";
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.startsWith("CHANGE_ME")) {
    // Fallback for seed script in dev environment
    return "dev_seed_secret_for_deterministic_tokens_only";
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

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@verdixa.dev";
  const passwordHash = await hashPassword("verdixa2026");

  // Admin
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, role: Role.admin },
  });

  // Organizer
  const organizerId = "organizer-seed-uuid-1234";
  const orgTokenRaw = "DETERMINISTIC_ORGANIZER_TOKEN";
  await prisma.user.upsert({
    where: { email: "organizer@verdixa.dev" },
    update: {},
    create: { 
      id: organizerId,
      email: "organizer@verdixa.dev", 
      passwordHash, 
      role: Role.organizer 
    },
  });
  await prisma.session.upsert({
    where: { token: orgTokenRaw },
    update: {},
    create: {
      userId: organizerId,
      token: orgTokenRaw,
      expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
    }
  });

  // Event
  let event = await prisma.event.findFirst();
  if (!event && data.event) {
    event = await prisma.event.create({
      data: {
        name: data.event.name,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        submissionDeadline: new Date(data.event.submissions_close),
        organizerId: organizerId,
        status: "closed", // So submissions are closed
      }
    });
    console.log(`[seed] Created event: ${event.name}`);
  }

  // Participant
  const participantId = "participant-seed-uuid-5678";
  const participantTokenRaw = "DETERMINISTIC_PARTICIPANT_TOKEN";
  const pEmail = data.teams?.[0]?.participant_email || "participant@verdixa.dev";
  const participant = await prisma.user.upsert({
    where: { email: pEmail },
    update: {},
    create: { 
      id: participantId,
      email: pEmail, 
      passwordHash, 
      role: Role.participant 
    },
  });
  await prisma.session.upsert({
    where: { token: participantTokenRaw },
    update: {},
    create: {
      userId: participantId,
      token: participantTokenRaw,
      expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
    }
  });

  // Judges
  for (const j of data.judges || []) {
    const rawToken = `DETERMINISTIC_${j.id.toUpperCase()}_TOKEN`;
    const judgeUser = await prisma.user.upsert({
      where: { email: j.email },
      update: {},
      create: { email: j.email, passwordHash, role: Role.judge },
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

  // Output deterministic headers for `.dogfood.toml`
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│  VERDIXA — Seed complete                        │");
  console.log("│  Use these signed tokens in .dogfood.toml:      │");
  console.log("│  organizer: Cookie: verdixa_session=" + signDeterministic(orgTokenRaw));
  console.log("│  judge_a  : Cookie: verdixa_session=" + signDeterministic("DETERMINISTIC_JUDGE_A_TOKEN"));
  console.log("│  judge_b  : Cookie: verdixa_session=" + signDeterministic("DETERMINISTIC_JUDGE_B_TOKEN"));
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
