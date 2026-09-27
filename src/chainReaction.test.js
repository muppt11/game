// Minimal, dependency-free tests for the cascade engine.
// Run with: node src/chainReaction.test.js

import {
  CRITICAL_THRESHOLD,
  EDGES,
  MAX_GLOBAL_DECAY,
  MinHeap,
  NODES,
  scoreCascade,
  simulateCascade,
  statusFor,
} from "./chainReaction.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

const decays = [0.5, 0.82, MAX_GLOBAL_DECAY];

// 1. The cascade always terminates (the heap drains) for every trigger node,
//    at every decay endless mode can reach, from a fresh or pre-stressed network.
for (const decay of decays) {
  for (const node of NODES) {
    const fresh = simulateCascade(node.id, { decay });
    assert(fresh.terminated, `cascade from "${node.id}" (decay ${decay}) should terminate`);
    const stressed = Object.fromEntries(NODES.map((n) => [n.id, 0.3]));
    const again = simulateCascade(node.id, { decay, startDistress: stressed });
    assert(again.terminated, `pre-stressed cascade from "${node.id}" (decay ${decay}) should terminate`);
  }
}

// 2. The termination argument: every hop multiplies impact by weight * decay < 1.
for (const edge of EDGES) {
  assert(edge.weight * MAX_GLOBAL_DECAY < 1, `${edge.from} -> ${edge.to} must strictly decay`);
}

// 3. Distress is monotonically non-decreasing per node, for every trigger,
//    and never leaves [0, 1].
for (const node of NODES) {
  const start = Object.fromEntries(NODES.map((n) => [n.id, 0.1]));
  const result = simulateCascade(node.id, { decay: MAX_GLOBAL_DECAY, startDistress: start });
  const seen = { ...start };
  let monotonic = true;
  let inRange = true;
  for (const event of result.events) {
    if (event.distress < seen[event.node]) monotonic = false;
    if (event.distress < 0 || event.distress > 1) inRange = false;
    seen[event.node] = event.distress;
  }
  assert(monotonic, `distress must be non-decreasing per node (trigger "${node.id}")`);
  assert(inRange, `distress must stay within [0, 1] (trigger "${node.id}")`);
  for (const n of NODES) {
    assert(result.distress[n.id] >= start[n.id], `"${n.id}" final distress never drops (trigger "${node.id}")`);
  }
}

// 4. A shock at the terminal node (Serving has no outgoing edges) goes nowhere.
{
  assert(!EDGES.some((edge) => edge.from === "serving"), "serving has no outgoing edges");
  const result = simulateCascade("serving");
  const others = result.events.filter((event) => event.node !== "serving");
  assert(others.length === 0, "a shock at a terminal node should not cascade further");
  NODES.filter((n) => n.id !== "serving").forEach((n) => {
    assert(result.distress[n.id] === 0, `"${n.id}" untouched by a serving shock`);
  });
}

// 5. The graph is a DAG (no cycles), and every station is reachable from Ingredients.
{
  const state = {};
  let acyclic = true;
  const visit = (id) => {
    if (state[id] === "active") acyclic = false;
    if (state[id]) return;
    state[id] = "active";
    EDGES.filter((edge) => edge.from === id).forEach((edge) => visit(edge.to));
    state[id] = "done";
  };
  NODES.forEach((node) => visit(node.id));
  assert(acyclic, "dependency graph must be acyclic");

  const reached = new Set(simulateCascade("ingredients").events.map((event) => event.node));
  NODES.forEach((node) => assert(reached.has(node.id), `"${node.id}" reachable from an ingredients shock`));
}

// 6. Events come out of the heap in time order.
{
  const heap = new MinHeap();
  [5, 1, 9, 3, 3, 0, 7, 2].forEach((time) => heap.push({ time }));
  const out = [];
  while (heap.size) out.push(heap.pop().time);
  assert(out.join() === "0,1,2,3,3,5,7,9", "min-heap pops in ascending time order");
  const result = simulateCascade("ingredients");
  assert(result.events.every((event, i) => i === 0 || event.time >= result.events[i - 1].time), "cascade events are time-ordered");
}

// 7. Scoring: deeper links are worth more, big cascades get a bonus, and a node
//    that is already critical isn't counted again.
{
  assert(scoreCascade([]).points === 0, "no critical nodes, no points");
  assert(scoreCascade([{ depth: 2 }]).points > scoreCascade([{ depth: 0 }]).points, "deeper critical node scores more");
  const four = [0, 1, 2, 3].map((depth) => ({ depth }));
  assert(scoreCascade(four).bonus > 0, "4+ critical stations earn a big-cascade bonus");

  const critical = Object.fromEntries(NODES.map((n) => [n.id, 0]));
  critical.serving = CRITICAL_THRESHOLD + 0.1;
  const result = simulateCascade("serving", { startDistress: critical });
  assert(result.criticalOrder.length === 0, "re-shocking an already-critical node scores nothing");
}

// 8. statusFor is a step function of distress.
assert(statusFor(0) === "healthy", "0 distress is healthy");
assert(statusFor(0.3) === "warning", "mid distress is a warning");
assert(statusFor(0.99) === "critical", "near-1 distress is critical");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
