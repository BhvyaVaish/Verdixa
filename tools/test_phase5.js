const ORG_COOKIE = "verdixa_session=sess_organizer.f7028ccf2b501b7c0f2b0a7a97b5ca6c74ade1632b1155514aeb98b90ff9eb54";
const PART_COOKIE = "verdixa_session=sess_participant.dc4d6886bab6ba4fc832d782b66092e5e4fc39e070babefaee7f92d15a52188c";

const EVENT_ID = "evt_01";
const PROJECT_ID = "prj_04";

async function req(path, method, cookie, body) {
  const res = await fetch(`http://localhost:3001${path}`, {
    method,
    headers: {
      "Cookie": cookie,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log("1. Creating active voting window...");
  const now = Date.now();
  const windowRes = await req("/api/v1/voting/window", "POST", ORG_COOKIE, {
    eventId: EVENT_ID,
    opensAt: new Date(now - 10000).toISOString(),
    closesAt: new Date(now + 60000).toISOString(), // open for 1 minute
    resultsHidden: true
  });
  console.log("Window created:", windowRes);
  const windowId = windowRes.data.window.id;

  console.log("\n2. Participant voting on prj_04...");
  const vote1 = await req("/api/v1/voting", "POST", PART_COOKIE, {
    votingWindowId: windowId,
    projectId: PROJECT_ID
  });
  console.log("Vote 1 (should succeed, 201):", vote1);

  console.log("\n3. Participant voting again on prj_04...");
  const vote2 = await req("/api/v1/voting", "POST", PART_COOKIE, {
    votingWindowId: windowId,
    projectId: PROJECT_ID
  });
  console.log("Vote 2 (should fail duplicate, 409):", vote2);

  console.log("\n4. Participant viewing ballot to check if counts are hidden...");
  const ballot = await req(`/api/v1/voting?eventId=${EVENT_ID}`, "GET", PART_COOKIE);
  const prj = ballot.data.projects.find(p => p.id === PROJECT_ID);
  console.log("Ballot entry for prj_04 (voteCount should be null):", {
    hasVoted: prj.hasVoted,
    voteCount: prj.voteCount
  });

  console.log("\n5. Creating closed voting window to test timing...");
  const closedWindowRes = await req("/api/v1/voting/window", "POST", ORG_COOKIE, {
    eventId: EVENT_ID,
    opensAt: new Date(now - 60000).toISOString(),
    closesAt: new Date(now - 10000).toISOString(), // closed 10 seconds ago
    resultsHidden: true
  });
  console.log("Closed window created.");
  
  console.log("\n6. Participant voting on closed window...");
  const voteClosed = await req("/api/v1/voting", "POST", PART_COOKIE, {
    votingWindowId: closedWindowRes.data.window.id,
    projectId: PROJECT_ID
  });
  console.log("Vote Closed (should fail timing, 403):", voteClosed);
}

runTests().catch(console.error);
