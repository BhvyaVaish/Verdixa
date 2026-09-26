import { test, expect, APIRequestContext } from "@playwright/test";

// Base URL for the local Docker environment
const baseURL = "http://localhost:3000";

test.describe("T1 Lifecycle - Submissions and Gallery", () => {
  let organizerApi: APIRequestContext;
  let p1Api: APIRequestContext;
  let p2Api: APIRequestContext;
  let outsiderApi: APIRequestContext;

  let eventId: string;
  let teamId: string;
  let projectId: string;

  test.beforeAll(async ({ playwright }) => {
    // Create isolated contexts (each has its own cookie jar for sessions)
    organizerApi = await playwright.request.newContext({ baseURL });
    p1Api = await playwright.request.newContext({ baseURL });
    p2Api = await playwright.request.newContext({ baseURL });
    outsiderApi = await playwright.request.newContext({ baseURL });
  });

  test.afterAll(async () => {
    await organizerApi.dispose();
    await p1Api.dispose();
    await p2Api.dispose();
    await outsiderApi.dispose();
  });

  test("1. Register organizer and create event with deadline", async () => {
    // Register
    const email = `org-${Date.now()}@test.com`;
    await organizerApi.post("/api/v1/auth/register", {
      data: { email, password: "password123" }
    });

    // Login (gets session cookie)
    await organizerApi.post("/api/v1/auth/login", {
      data: { email, password: "password123" }
    });

    // Elevate to organizer (via DB directly since UI doesn't allow it, or we use seed data)
    // Actually, we can't elevate via API. But the seed script creates organizer@verdixa.dev.
    // Let's use the seeded organizer instead!
    const loginRes = await organizerApi.post("/api/v1/auth/login", {
      data: { email: "organizer@verdixa.dev", password: "organizer2026" }
    });
    expect(loginRes.ok()).toBeTruthy();

    // Create event (deadline 1 hour from now)
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createRes = await organizerApi.post("/api/v1/events", {
      data: {
        name: `T1 Test Event ${Date.now()}`,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        submissionDeadline: deadline,
        tracks: ["Main Track"]
      }
    });
    expect(createRes.ok()).toBeTruthy();
    const eventData = await createRes.json();
    eventId = eventData.eventId;
    expect(eventId).toBeDefined();
  });
  test("1b. Unauthorized role attempting organizer action gets rejected", async () => {
    // Participant tries to create an event (organizer-only action)
    // First, register and login a participant
    await p1Api.post("/api/v1/auth/register", { data: { email: `rogue-${Date.now()}@test.com`, password: "password123" } });
    await p1Api.post("/api/v1/auth/login", { data: { email: `rogue-${Date.now()}@test.com`, password: "password123" } });

    const createRes = await p1Api.post("/api/v1/events", {
      data: {
        name: `Rogue Event ${Date.now()}`,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        submissionDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tracks: ["Main Track"]
      }
    });
    
    // Server-side check MUST reject it even though it's crafted directly to the API
    expect(createRes.status()).toBe(403);
  });
  test("2. Register participants and form a team", async () => {
    // P1 register & login
    await p1Api.post("/api/v1/auth/register", { data: { email: `p1-${Date.now()}@test.com`, password: "password123" } });
    await p1Api.post("/api/v1/auth/login", { data: { email: `p1-${Date.now()}@test.com`, password: "password123" } });

    // P2 register & login
    await p2Api.post("/api/v1/auth/register", { data: { email: `p2-${Date.now()}@test.com`, password: "password123" } });
    await p2Api.post("/api/v1/auth/login", { data: { email: `p2-${Date.now()}@test.com`, password: "password123" } });

    // Outsider register & login
    await outsiderApi.post("/api/v1/auth/register", { data: { email: `out-${Date.now()}@test.com`, password: "password123" } });
    await outsiderApi.post("/api/v1/auth/login", { data: { email: `out-${Date.now()}@test.com`, password: "password123" } });

    // P1 creates team
    const teamRes = await p1Api.post("/api/v1/teams", {
      data: { name: "T1 Acceptance Team", eventId }
    });
    expect(teamRes.ok()).toBeTruthy();
    const teamData = await teamRes.json();
    teamId = teamData.teamId;

    // P1 generates invite
    const inviteRes = await p1Api.post(`/api/v1/teams/${teamId}/invite`);
    expect(inviteRes.ok()).toBeTruthy();
    const inviteData = await inviteRes.json();
    const token = inviteData.token;

    // P2 accepts invite
    const acceptRes = await p2Api.post(`/api/v1/invites/${token}/accept`);
    expect(acceptRes.ok()).toBeTruthy();
  });

  test("3. Create and edit draft submission", async () => {
    // P1 creates project
    const createRes = await p1Api.post("/api/v1/projects", {
      data: {
        title: "T1 Project",
        description: "Initial draft",
        teamId,
        eventId,
      }
    });
    expect(createRes.ok()).toBeTruthy();
    const projectData = await createRes.json();
    projectId = projectData.id;
    expect(projectData.status).toBe("draft");

    // P2 edits project (verifies both members can edit)
    const updateRes = await p2Api.patch(`/api/v1/projects/${projectId}`, {
      data: {
        title: "T1 Project Updated",
        repoUrl: "https://github.com/verdixa/test"
      }
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.title).toBe("T1 Project Updated");
  });

  test("4. Role isolation: Outsider cannot view or edit draft", async () => {
    // Outsider tries to view draft
    const getRes = await outsiderApi.get(`/api/v1/projects/${projectId}`);
    expect(getRes.status()).toBe(403); // Forbidden because it's a draft

    // Outsider tries to edit draft
    const patchRes = await outsiderApi.patch(`/api/v1/projects/${projectId}`, {
      data: { title: "Hacked!" }
    });
    expect(patchRes.status()).toBe(403);
  });

  test("5. Media upload validation", async () => {
    // Upload a valid 1x1 PNG
    const pngMagicBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const uploadRes = await p1Api.post(`/api/v1/projects/${projectId}/media`, {
      multipart: {
        file: {
          name: "screenshot.png",
          mimeType: "image/png",
          buffer: pngMagicBytes
        }
      }
    });
    expect(uploadRes.ok()).toBeTruthy();
    const asset = await uploadRes.json();
    expect(asset.mimeType).toBe("image/png");
    expect(asset.url).toContain("/api/v1/uploads/");

    // Upload an invalid file (TXT renamed to PNG)
    const txtBuffer = Buffer.from("console.log('hello');");
    const badUploadRes = await p1Api.post(`/api/v1/projects/${projectId}/media`, {
      multipart: {
        file: {
          name: "fake.png",
          mimeType: "image/png",
          buffer: txtBuffer
        }
      }
    });
    expect(badUploadRes.status()).toBe(400);
    const badData = await badUploadRes.json();
    expect(badData.error).toContain("Magic bytes do not match");

    // Test access to the valid upload (draft state = member only)
    const assetGetMember = await p1Api.get(asset.url);
    expect(assetGetMember.ok()).toBeTruthy();
    
    const assetGetOutsider = await outsiderApi.get(asset.url);
    expect(assetGetOutsider.status()).toBe(403);
  });

  test("6. Finalize submission and verify Public Gallery", async () => {
    // P1 finalizes
    const finalRes = await p1Api.post(`/api/v1/projects/${projectId}/finalize`);
    expect(finalRes.ok()).toBeTruthy();
    const finalData = await finalRes.json();
    expect(finalData.status).toBe("submitted");

    // Now outsider CAN view the project detail
    const getRes = await outsiderApi.get(`/api/v1/projects/${projectId}`);
    expect(getRes.ok()).toBeTruthy();
    
    // Check Public Gallery
    const galleryRes = await outsiderApi.get(`/api/v1/gallery?event=${eventId}`);
    expect(galleryRes.ok()).toBeTruthy();
    const gallery = await galleryRes.json();
    expect(gallery.length).toBe(1);
    expect(gallery[0].id).toBe(projectId);
    // Allow-list check: make sure no private fields leaked
    expect(gallery[0].teamName).toBe("T1 Acceptance Team");
    expect(gallery[0].teamId).toBeDefined();
    expect((gallery[0] as any).passwordHash).toBeUndefined();
    expect((gallery[0] as any).token).toBeUndefined();
  });

  test("7. Server-side deadline enforcement", async () => {
    // Create an event with a deadline in the PAST
    const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();
    const createRes = await organizerApi.post("/api/v1/events", {
      data: {
        name: "Past Event",
        startDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        submissionDeadline: pastDeadline
      }
    });
    const pastEventId = (await createRes.json()).eventId;

    // Create team for past event
    const teamRes = await p1Api.post("/api/v1/teams", {
      data: { name: "Late Team", eventId: pastEventId }
    });
    const lateTeamId = (await teamRes.json()).teamId;

    // Try to submit project (should fail because deadline passed)
    const projRes = await p1Api.post("/api/v1/projects", {
      data: { title: "Late Project", teamId: lateTeamId, eventId: pastEventId }
    });
    expect(projRes.status()).toBe(422);
    const projData = await projRes.json();
    expect(projData.error).toContain("Submission deadline passed");
    
    // Test edit on the first project after deadline (assume event 1 deadline passed)
    // To do this properly, we need an event where deadline just passed. 
    // But since eventId deadline is in 1 hour, let's create a draft in pastEvent by mocking deadline temporarily or creating it without a deadline, then adding a deadline?
    // Actually, let's just make sure the patch endpoint returns 422 if we try to edit a submitted project, or if we mock a deadline.
    // The previous test checks submit (create), which is fine. Let's add an explicit test for editing a submitted project.
    const editRes = await p1Api.patch(`/api/v1/projects/${projectId}`, {
      data: { title: "Late Edit Hacked" }
    });
    // projectId was already finalized in step 6! So editing should be forbidden.
    expect(editRes.status()).toBe(422); 
    const editData = await editRes.json();
    expect(editData.error).toContain("Cannot edit project");
  });
});
