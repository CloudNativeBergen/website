/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/proposals.json', 'utf8'));

const talks = data.filter((t: any) => t.status === 'confirmed' || t.status === 'submitted');

// Calculate average scores
for (const t of talks) {
  let content = 0, relevance = 0, speaker = 0;
  if (t.reviews && t.reviews.length > 0) {
    for (const r of t.reviews) {
      if (r.score) {
        content += r.score.content || 0;
        relevance += r.score.relevance || 0;
        speaker += r.score.speaker || 0;
      }
    }
    t.avgScore = (content + relevance + speaker) / (t.reviews.length * 3);
  } else {
    t.avgScore = 0;
  }
}

// Sort by score
talks.sort((a: any, b: any) => b.avgScore - a.avgScore);

let totalMinutes = 0;
const selected = [];

for (const t of talks) {
  // Determine duration
  let duration = 0;
  if (t.format === 'presentation_20') duration = 20;
  else if (t.format === 'presentation_40') duration = 40;
  else if (t.format === 'lightning_10') duration = 10;
  else if (t.format === 'workshop_half') duration = 240;
  else duration = 20; // default

  if (totalMinutes + duration <= 900) {
    selected.push(t);
    totalMinutes += duration;
  }
}

console.log(`Selected ${selected.length} talks for a total of ${totalMinutes} minutes.`);
console.log('--- Selected Talks ---');
for (const t of selected) {
  console.log(`[${t.format}] (Score: ${t.avgScore.toFixed(2)}) ${t.title}`);
}

const schedule = {
  _id: "draft-900m-schedule",
  _type: "schedule",
  title: "900m Technical Rigor Schedule",
  date: "2026-08-20",
  status: "draft",
  conference: { _ref: "eb7b16c6-00fa-44a0-adcd-4a480de34242" },
  tracks: [
    {
      trackTitle: "Main Track",
      talks: selected.map((t: any) => ({
        _key: Math.random().toString(36).substring(7),
        talk: { _ref: t._id || t.id }
      }))
    }
  ]
};

fs.writeFileSync('/tmp/draft-schedule.json', JSON.stringify(schedule, null, 2));
console.log('Saved to /tmp/draft-schedule.json');
