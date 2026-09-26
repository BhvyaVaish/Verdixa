const fs = require('fs');

const event = { name: "Dogfood 2026", submissions_close: "2026-03-01T18:00:00Z" };
const tracks = [
  "Web App", "Mobile App", "AI/ML", "Developer Tool", "Open Source", "Hardware", "Games", "Social Impact"
].map((name, i) => ({ id: `trk_${String(i+1).padStart(2, '0')}`, name }));

const judges = Array.from({ length: 30 }, (_, i) => ({
  id: `jdg_${String(i+1).padStart(2, '0')}`,
  email: `judge${i+1}@example.com`,
  name: `Judge ${i+1}`
}));

const teams = Array.from({ length: 40 }, (_, i) => ({
  id: `tm_${String(i+1).padStart(2, '0')}`,
  name: `Team ${i+1}`,
  members: [{ email: `member1_tm${i+1}@example.com` }]
}));

const projects = Array.from({ length: 40 }, (_, i) => {
  const tm_id = `tm_${String(i+1).padStart(2, '0')}`;
  const is07 = i === 6;
  return {
    id: `prj_${String(i+1).padStart(2, '0')}`,
    title: is07 ? "Dry Harbour" : `Project ${i+1}`,
    team_id: tm_id,
    track_id: tracks[i % 8].id,
    repo_url: is07 ? "https://example.org/repo/07" : `https://example.org/repo/${i+1}`,
    demo_url: `https://example.org/demo/${i+1}`
  };
});
// Add duplicate for tm_07
projects.push({
  id: "prj_41",
  title: "Dry Harbour",
  team_id: "tm_07",
  track_id: tracks[6 % 8].id,
  repo_url: "https://example.org/repo/07",
  demo_url: "https://example.org/demo/41"
});

const scores = [];
let jdg7Count = 0;
// 126 scores total. 
for (let i = 0; i < 126; i++) {
  const p = i % 41;
  let j = i % 30;
  
  if (jdg7Count < 5 && j === 6) {
      // let jdg_07 judge 5 projects
      scores.push({
        judge_id: "jdg_07",
        project_id: projects[p].id,
        functionality: 4,
        quality: 4,
        innovation: 4
      });
      jdg7Count++;
  } else {
    // If it falls on jdg_07 and we already have 5, shift judge
    if (j === 6) j = 7;
    scores.push({
      judge_id: judges[j].id,
      project_id: projects[p].id,
      functionality: (i % 5) + 1,
      quality: ((i + 1) % 5) + 1,
      innovation: ((i + 2) % 5) + 1
    });
  }
}

const fixture = { event, tracks, judges, teams, projects, scores };
fs.writeFileSync('tools/acceptance/fixtures.json', JSON.stringify(fixture, null, 2));
