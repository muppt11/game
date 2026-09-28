// Dependency-free tests for the bakery game logic.
// Run with: node src/game/shift.test.js

import { simulateCascade } from "../chainReaction.js";
import { COMBOS, DAYS, FULL_MENU, KITCHEN_EDGES, KITCHEN_NODES, RULES, STARTING_MENU, cupcakeValue } from "./data.js";
import { buy, createRun, dayConfig, finishDay, shopItems, starsFor } from "./run.js";
import { chainLevelFor, createShift, generateCustomers, hintFor, matchesOrder, targetFor } from "./shift.js";

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

const quietDay = { length: 300, spawnEvery: 1000, patience: 60, surpriseChance: 1, comboChance: 0, toGoChance: 0, goal: 10 };

function makeShift(overrides = {}) {
  const events = [];
  const shift = createShift({ day: quietDay, seed: 1, menu: FULL_MENU, onEvent: (event) => events.push(event), ...overrides });
  return { shift, events, has: (type) => events.some((event) => event.type === type) };
}

function run(shift, stationId, actionId) {
  const ok = shift.perform(stationId, actionId);
  shift.tick(2);
  return ok;
}

function bakeCupcake(shift, flavor, frosting, topping) {
  run(shift, "cafeTable", `flavor:${flavor}`);
  run(shift, "oven", "bake");
  shift.tick(shift.state.bakeTime);
  run(shift, "oven", "takeOut");
  run(shift, "frostingCounter", `frost:${frosting}`);
  if (topping !== "none") run(shift, "decoratingCounter", `top:${topping}`);
  return shift.state.hands[0];
}

// 1. The same seed gives the same customers (Bake-Off fairness).
{
  const a = generateCustomers(DAYS[3], FULL_MENU, 42);
  const b = generateCustomers(DAYS[3], FULL_MENU, 42);
  const c = generateCustomers(DAYS[3], FULL_MENU, 43);
  assert(JSON.stringify(a) === JSON.stringify(b), "same seed => identical customers");
  assert(JSON.stringify(a) !== JSON.stringify(c), "different seed => different customers");
  assert(a.every((customer) => customer.arriveAt < DAYS[3].length), "all customers arrive before closing");
  const starter = generateCustomers(DAYS[4], STARTING_MENU, 7);
  assert(starter.every((customer) => !customer.order || (STARTING_MENU.flavors.includes(customer.order.flavor)
    && STARTING_MENU.frostings.includes(customer.order.frosting)
    && STARTING_MENU.toppings.includes(customer.order.topping))), "orders only use unlocked menu items");
}

// 2. The full pipeline: flavor -> oven -> frosting -> topping -> serve.
{
  const { shift, events, has } = makeShift();
  shift.tick(2);
  assert(shift.state.customers.length === 1, "first customer arrives");
  const item = bakeCupcake(shift, "vanilla", "buttercream", "sprinkles");
  assert(item && item.stage === "baked" && item.frosting === "buttercream" && item.topping === "sprinkles", "cupcake goes through every station");
  const serve = shift.stationActions("bakeryDoor").find((entry) => entry.id.startsWith("serve:"));
  assert(serve, "a finished cupcake can be served to a surprise customer");
  run(shift, "bakeryDoor", serve.id);
  assert(shift.state.served === 1 && shift.state.coins > 0 && shift.state.points > 0, "serving earns coins and points");
  assert(shift.state.chain === 1, "serving starts a chain");
  assert(has("comboDiscovered") && shift.state.combosFound.includes("birthday"), "vanilla+buttercream+sprinkles discovers Birthday Party");
  const served = events.find((event) => event.type === "served");
  assert(served.coins >= Math.round(cupcakeValue(item) * RULES.surpriseMultiplier * 0.7), "surprise orders pay the surprise multiplier");
}

// 3. Oven: bake time, burning, and burnt cupcakes can't be frosted.
{
  const { shift, has } = makeShift();
  run(shift, "cafeTable", "flavor:chocolate");
  run(shift, "oven", "bake");
  assert(shift.state.oven[0]?.item.stage === "baking", "cupcake is baking");
  shift.tick(shift.state.bakeTime + RULES.burnGrace + 1);
  assert(has("burnt") && shift.state.oven[0].item.stage === "burnt", "left too long, it burns");
  run(shift, "oven", "takeOut");
  assert(shift.stationActions("frostingCounter").every((entry) => !entry.enabled), "burnt cupcakes can't be frosted");
  assert(/toss/i.test(hintFor(shift.state.hands[0])), "hint says to toss a burnt cupcake");
  run(shift, "cafeTable", "trash");
  assert(shift.state.hands.length === 0, "burnt cupcake tossed");
}

// 4. Hands: one cupcake at a time without the Serving Tray, two with it.
{
  const { shift } = makeShift();
  run(shift, "cafeTable", "flavor:vanilla");
  assert(!shift.stationActions("cafeTable").find((entry) => entry.id === "flavor:vanilla").enabled, "can't carry two without a tray");
  const tray = makeShift({ upgrades: { tray: 1 } }).shift;
  run(tray, "cafeTable", "flavor:vanilla");
  run(tray, "cafeTable", "flavor:lemon");
  assert(tray.state.hands.length === 2, "the Serving Tray carries two");
}

// 5. To-go orders need a box; exact orders need the exact cupcake.
{
  const item = { flavor: "chocolate", stage: "baked", frosting: "chocolate", topping: "shavings", boxed: false };
  const exact = { order: { flavor: "chocolate", frosting: "chocolate", topping: "shavings" }, toGo: false };
  assert(matchesOrder(item, exact), "exact order matches");
  assert(!matchesOrder({ ...item, topping: "cherry" }, exact), "wrong topping doesn't match");
  assert(!matchesOrder(item, { ...exact, toGo: true }), "to-go needs a box");
  assert(matchesOrder({ ...item, boxed: true }, { ...exact, toGo: true }), "boxed cupcake matches to-go");
  assert(!matchesOrder({ ...item, topping: null }, exact), "plain doesn't match a topped order");
  assert(matchesOrder({ ...item, topping: null }, { order: { ...exact.order, topping: "none" }, toGo: false }), "plain matches a plain order");
}

// 6. Losing a customer breaks the chain, unless the Chain Saver catches it.
for (const saver of [0, 1]) {
  const busyDay = { ...quietDay, spawnEvery: 3, patience: 20 };
  const { shift, events, has } = makeShift({ day: busyDay, upgrades: { chainSaver: saver } });
  shift.tick(2);
  const item = bakeCupcake(shift, "vanilla", "buttercream", "none");
  run(shift, "bakeryDoor", shift.stationActions("bakeryDoor").find((entry) => entry.id.startsWith("serve:")).id);
  assert(item && shift.state.chain === 1, `chain started (saver ${saver})`);
  shift.tick(30);
  assert(shift.state.lost > 0, `a customer ran out of patience (saver ${saver})`);
  const firstChainEvent = events.find((event) => event.type === "chainSaved" || event.type === "chainBroken");
  if (saver) assert(firstChainEvent?.type === "chainSaved", "Chain Saver catches the first lost customer");
  else assert(has("chainBroken") && shift.state.chain === 0, "lost customer breaks the chain");
}

// 7. Every third serve in a row levels the multiplier and sets off a chain reaction.
{
  assert(chainLevelFor(0) === 1 && chainLevelFor(3) === 2 && chainLevelFor(6) === 3 && chainLevelFor(99) === RULES.maxChainLevel, "chain levels step every 3");
  const busyDay = { ...quietDay, spawnEvery: 2, patience: 200 };
  const { shift, events } = makeShift({ day: busyDay, upgrades: { tray: 1 } });
  shift.tick(8);
  for (let i = 0; i < 3; i += 1) {
    bakeCupcake(shift, "strawberry", "strawberry", "none");
    run(shift, "bakeryDoor", shift.stationActions("bakeryDoor").find((entry) => entry.id.startsWith("serve:")).id);
  }
  const reaction = events.find((event) => event.type === "chainReaction");
  assert(reaction && reaction.level === 2, "third serve in a row triggers a chain reaction");
  const lastServe = events.filter((event) => event.type === "served").at(-1);
  assert(lastServe.points === lastServe.coins * RULES.pointsPerCoin * 2, "points use the chain multiplier");
}

// 8. Heat: turbo baking overheats the oven, jams it, and the heat cascades downstream.
{
  const { shift, events, has } = makeShift({ upgrades: { ovenRack: 2 } });
  for (let i = 0; i < 2; i += 1) {
    run(shift, "cafeTable", `flavor:vanilla`);
    shift.perform("oven", "turbo");
    shift.tick(0.7);
  }
  assert(has("overheat") && shift.state.jammed.has("oven"), "two quick turbo bakes overheat the oven");
  const ovenActions = shift.stationActions("oven");
  assert(ovenActions.length === 1 && ovenActions[0].id === "cool", "a jammed station only offers Cool it down");
  shift.tick(1.5);
  const waves = events.filter((event) => event.type === "heatWave").map((event) => event.station);
  assert(waves.includes("frostingCounter"), "the oven's heat spreads to the frosting station");
  assert(shift.state.heat.frostingCounter > 0.3, "downstream station heats up");
  assert(!waves.includes("cafeTable"), "heat never flows upstream");
  const before = shift.state.heat.oven;
  run(shift, "oven", "cool");
  assert(shift.state.heat.oven < before - 0.3, "cooling knocks the heat down");
  shift.tick(30);
  assert(!shift.state.jammed.has("oven") && has("recovered"), "stations recover as they cool");
}

// 9. The kitchen heat graph is a DAG and every cascade terminates.
{
  for (const node of KITCHEN_NODES) {
    const result = simulateCascade(node.id, { nodes: KITCHEN_NODES, edges: KITCHEN_EDGES, decay: RULES.heat.cascadeDecay });
    assert(result.terminated, `kitchen cascade from ${node.id} terminates`);
  }
  const serving = simulateCascade("bakeryDoor", { nodes: KITCHEN_NODES, edges: KITCHEN_EDGES });
  assert(serving.events.every((event) => event.node === "bakeryDoor"), "serving is the end of the line");
  assert(KITCHEN_EDGES.every((edge) => edge.weight * RULES.heat.cascadeDecay < 1), "every kitchen hop decays");
}

// 10. Busy actions are re-checked: a customer who leaves mid-serve isn't served.
{
  const busyDay = { ...quietDay, patience: 40 };
  const { shift, has } = makeShift({ day: busyDay });
  shift.tick(2);
  bakeCupcake(shift, "vanilla", "chocolate", "none");
  const serve = shift.stationActions("bakeryDoor").find((entry) => entry.id.startsWith("serve:"));
  if (serve) {
    shift.state.customers[0].patience = 0.1;
    shift.perform("bakeryDoor", serve.id);
    shift.tick(0.5);
    shift.tick(0.5);
    assert(has("actionFailed") && shift.state.served === 0, "serve fails if the customer already left");
  } else {
    assert(false, "expected a serve action");
  }
}

// 11b. Holding the clock (tutorial) freezes the day and patience, not the oven.
{
  const { shift } = makeShift({ day: { ...quietDay, length: 60 } });
  shift.tick(2);
  shift.setHold(true);
  const patience = shift.state.customers[0].patience;
  run(shift, "cafeTable", "flavor:vanilla");
  run(shift, "oven", "bake");
  shift.tick(shift.state.bakeTime + 1);
  assert(shift.state.clock === 2, "held clock doesn't move");
  assert(shift.state.customers[0].patience === patience, "held customers don't lose patience");
  assert(shift.state.oven[0].item.stage === "baked", "the oven still bakes while the clock is held");
  shift.setHold(false);
  shift.tick(1);
  assert(shift.state.clock === 3, "clock resumes after the hold");
}

// 11. The shift ends on time and reports a summary.
{
  const { shift, events } = makeShift({ day: { ...quietDay, length: 20 } });
  shift.tick(25);
  const end = events.find((event) => event.type === "shiftEnd");
  assert(shift.state.ended && end && typeof end.summary.coins === "number", "shift ends with a summary");
  assert(!shift.perform("cafeTable", "flavor:vanilla"), "no actions after closing");
}

// 12. Runs: the shop, goals, and winning.
{
  const solo = createRun({ mode: "solo", seed: 5 });
  assert(solo.coins === 0 && dayConfig(solo) === DAYS[0], "solo run starts broke on day 1");
  solo.coins = 100;
  assert(buy(solo, "skates") && solo.coins === 60 && solo.upgrades.skates === 1, "buying an upgrade spends coins");
  assert(!buy(solo, "skates"), "single-level upgrades max out");
  assert(buy(solo, "menu:flavors:lemon") && solo.menu.flavors.includes("lemon"), "buying a menu item unlocks it");
  assert(!shopItems(solo).find((item) => item.id === "ovenRack").affordable || solo.coins >= 60, "affordability tracks coins");
  const failDay = finishDay(solo, { coins: 10, points: 100, combosFound: [], served: 1, lost: 3, bestChain: 1, perfect: false });
  assert(!failDay.goalMet && solo.over && !solo.won, "missing the goal ends the run");

  const winner = createRun({ mode: "solo", seed: 9 });
  for (let day = 0; day < DAYS.length; day += 1) {
    finishDay(winner, { coins: DAYS[day].goal, points: 1000, combosFound: ["birthday"], served: 5, lost: 0, bestChain: 5, perfect: true });
  }
  assert(winner.over && winner.won && winner.score === 1000 * DAYS.length, "meeting every goal wins the run");
  assert(winner.discovered.length === 1, "discovered combos are merged, not duplicated");
  assert(starsFor(50, 50) === 1 && starsFor(75, 50) === 2 && starsFor(100, 50) === 3 && starsFor(49, 50) === 0, "star thresholds");

  const vs = createRun({ mode: "vs", seed: 3 });
  assert(vs.coins > 0 && vs.menu.flavors.length === Object.keys(FULL_MENU.flavors).length, "Bake-Off starts with a budget and the full menu");
  assert(shopItems(vs).every((item) => item.kind === "upgrade"), "Bake-Off shop only sells kitchen upgrades");
}

// 13. Every combo is makeable from the full menu and is worth more than its parts.
for (const combo of COMBOS) {
  const item = { flavor: combo.flavor, frosting: combo.frosting, topping: combo.topping };
  assert(FULL_MENU.flavors.includes(combo.flavor) && FULL_MENU.frostings.includes(combo.frosting) && FULL_MENU.toppings.includes(combo.topping), `${combo.name} is makeable`);
  assert(cupcakeValue(item) > cupcakeValue({ ...item, topping: "none" }), `${combo.name} beats a plain version`);
}

// Guidance follows compatible orders and never sends an empty-handed baker
// back to Ingredients while their cupcake is still in the oven.
{
  const item = { stage: "baked", flavor: "vanilla", frosting: "chocolate", topping: null, boxed: false };
  const customers = [
    { name: "Wrong frosting", order: { flavor: "vanilla", frosting: "vanilla", topping: "none" } },
    { name: "Right order", order: { flavor: "vanilla", frosting: "chocolate", topping: "sprinkles" }, toGo: true },
  ];
  assert(targetFor(item, customers) === customers[1], "target respects frosting, not just flavor");
  assert(/Toppings/.test(hintFor(item, customers)), "add required topping before boxing");
  const topped = { ...item, topping: "sprinkles" };
  assert(/Packaging/.test(hintFor(topped, customers)), "box matching to-go order after topping");
  assert(/Serve Right order/.test(hintFor({ ...topped, boxed: true }, customers)), "name the matching customer");
  assert(/No matching order/.test(hintFor({ ...item, flavor: "lemon" }, customers)), "explain incompatible cupcake recovery");
  for (const stage of ["baking", "baked", "burnt"]) {
    assert(/Oven/.test(hintFor(null, customers, [{ item: { stage } }])), `direct player to ${stage} cupcake in oven`);
  }
  assert(/Serving/.test(hintFor(item, [{ name: "Plain", order: { flavor: "vanilla", frosting: "chocolate", topping: "none" } }])), "plain order goes directly to Serving");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
