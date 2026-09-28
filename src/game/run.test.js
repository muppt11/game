// Difficulty affects actual customer waiting time, without changing recipes or
// the shared Bake-Off schedule. Run with: node src/game/run.test.js
import assert from "node:assert/strict";
import { BAKE_OFF_DAY, DAYS } from "./data.js";
import { createRun, dayConfig, daySeed } from "./run.js";
import { createShift, generateCustomers } from "./shift.js";

assert.equal(createRun({ seed: 1 }).difficulty, "easy", "new players start with more time");
for (const difficulty of [undefined, null, "", "unknown", "__proto__"]) {
  assert.equal(createRun({ seed: 1, difficulty }).difficulty, "easy", "invalid saved values fall back to Easy");
}

const originals = JSON.stringify({ DAYS, BAKE_OFF_DAY });
const runs = Object.fromEntries(["easy", "medium", "hard"].map((difficulty) => {
  const run = createRun({ seed: 42, difficulty });
  run.day = 5;
  return [difficulty, run];
}));
const shifts = Object.fromEntries(Object.entries(runs).map(([difficulty, run]) => [difficulty,
  createShift({ day: dayConfig(run), seed: daySeed(run), menu: run.menu })]));

for (let second = 0; second < 2; second += 0.1) Object.values(shifts).forEach((shift) => shift.tick(0.1));
const firstId = shifts.hard.state.customers[0].id;
assert.equal(shifts.hard.state.customers[0].patienceMax, 36);
assert.equal(shifts.medium.state.customers[0].patienceMax, 54);
assert.equal(shifts.easy.state.customers[0].patienceMax, 72);
const stillWaiting = (difficulty) => shifts[difficulty].state.customers.some((customer) => customer.id === firstId);
for (let second = 2; second < 38; second += 0.1) Object.values(shifts).forEach((shift) => shift.tick(0.1));
assert.equal(stillWaiting("hard"), false, "Hard customer leaves when the original timer runs out");
assert.equal(stillWaiting("medium"), true, "Medium customer is still available for service");
assert.equal(stillWaiting("easy"), true, "Easy customer is still available for service");
for (let second = 38; second < 56; second += 0.1) Object.values(shifts).forEach((shift) => shift.tick(0.1));
assert.equal(stillWaiting("medium"), false, "Medium customer eventually leaves too");
assert.equal(stillWaiting("easy"), true, "Easy grants another window to finish the order");
for (let second = 56; second < 74; second += 0.1) shifts.easy.tick(0.1);
assert.equal(stillWaiting("easy"), false, "Easy still has a real customer timer");

const jukebox = createShift({ day: dayConfig(runs.easy), seed: 1, menu: runs.easy.menu, upgrades: { jukebox: 1 } });
jukebox.tick(2);
assert.equal(jukebox.state.customers[0].patienceMax, 90, "Jukebox extends the selected difficulty's timer");

for (const difficulty of ["easy", "medium", "hard"]) {
  const a = createRun({ mode: "vs", seed: 42, difficulty, name: "A" });
  const b = createRun({ mode: "vs", seed: 42, difficulty, name: "B" });
  assert.deepEqual(dayConfig(a), dayConfig(b), "both Bake-Off players get the same timers");
  assert.deepEqual(generateCustomers(dayConfig(a), a.menu, daySeed(a)), generateCustomers(dayConfig(b), b.menu, daySeed(b)));
  const config = dayConfig(a);
  config.patience = 1;
  assert.notEqual(dayConfig(a).patience, 1, "callers cannot overwrite shared difficulty configuration");
}
assert.deepEqual(generateCustomers(dayConfig(runs.easy), runs.easy.menu, daySeed(runs.easy)), generateCustomers(dayConfig(runs.hard), runs.hard.menu, daySeed(runs.hard)), "difficulty changes waiting time without rerolling orders");
assert.equal(JSON.stringify({ DAYS, BAKE_OFF_DAY }), originals, "difficulty never mutates the baseline days");
console.log("Difficulty tests passed: live customer timers, default and saved values, upgrades, and Bake-Off fairness.");
