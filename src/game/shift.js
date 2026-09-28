// One bakery shift (a "day"): customers, the cupcake pipeline, the chain
// multiplier, and kitchen heat. Pure logic - no DOM, no Kaboom - driven by
// tick(dt) and perform(stationId, actionId), reporting through onEvent.

import { CRITICAL_THRESHOLD, WARNING_THRESHOLD, simulateCascade } from "../chainReaction.js";
import {
  COMBOS,
  CUSTOMER_NAMES,
  FLAVORS,
  FROSTINGS,
  KITCHEN_EDGES,
  KITCHEN_NODES,
  RULES,
  TOPPINGS,
  comboFor,
  cupcakeValue,
  describeCupcake,
  stationById,
} from "./data.js";
import { createRng } from "./rng.js";

const MAX_CUSTOMERS_INSIDE = 4;

// The whole day's customers are rolled up front from the seed, so two players
// in a Bake-Off see exactly the same line no matter how they play.
export function generateCustomers(day, menu, seed) {
  const rng = createRng(seed);
  const combos = COMBOS.filter((combo) => menu.flavors.includes(combo.flavor)
    && menu.frostings.includes(combo.frosting)
    && menu.toppings.includes(combo.topping));
  const toppings = menu.toppings.filter((topping) => topping !== "none");
  const customers = [];
  let time = 1.5;
  while (time < day.length - 8) {
    const surprise = rng.chance(day.surpriseChance);
    let order = null;
    if (!surprise) {
      if (combos.length > 0 && rng.chance(day.comboChance)) {
        const combo = rng.pick(combos);
        order = { flavor: combo.flavor, frosting: combo.frosting, topping: combo.topping };
      } else {
        order = {
          flavor: rng.pick(menu.flavors),
          frosting: rng.pick(menu.frostings),
          topping: rng.chance(0.25) || toppings.length === 0 ? "none" : rng.pick(toppings),
        };
      }
    }
    customers.push({
      id: customers.length + 1,
      name: rng.pick(CUSTOMER_NAMES),
      arriveAt: time,
      order,
      comboId: order ? comboFor(order)?.id ?? null : null,
      toGo: rng.chance(day.toGoChance),
    });
    time += day.spawnEvery * rng.range(0.7, 1.3);
  }
  return customers;
}

export function isFinished(item) {
  return Boolean(item && item.stage === "baked" && item.frosting);
}

export function matchesOrder(item, customer) {
  if (!isFinished(item)) return false;
  if (customer.toGo && !item.boxed) return false;
  if (!customer.order) return true;
  return item.flavor === customer.order.flavor
    && item.frosting === customer.order.frosting
    && (item.topping ?? "none") === customer.order.topping;
}

export function chainLevelFor(chain) {
  return Math.min(RULES.maxChainLevel, 1 + Math.floor(chain / RULES.chainStep));
}

// What the player should do next with the cupcake in their hands.
// Prefer an order compatible with everything already added to this cupcake.
export function targetFor(item, customers = []) {
  if (!item) return customers[0];
  return customers.find((customer) => customer.order
    && customer.order.flavor === item.flavor
    && (!item.frosting || customer.order.frosting === item.frosting)
    && (!item.topping || customer.order.topping === item.topping))
    ?? customers.find((customer) => !customer.order);
}

export function hintFor(item, customers = [], oven = []) {
  if (!item) {
    if (oven.some((slot) => slot?.item.stage === "baked")) return "Click Oven → Take out the baked cupcake";
    if (oven.some((slot) => slot?.item.stage === "burnt")) return "Click Oven → Take out (burnt!), then Ingredients → Toss";
    if (oven.some((slot) => slot?.item.stage === "baking")) return "Baking… wait for the ding, then click Oven → Take out";
    const target = targetFor(null, customers);
    return target?.order ? `Click Ingredients → ${FLAVORS[target.order.flavor].name} batter for ${target.name}` : "Click Ingredients to grab a flavor";
  }
  if (item.stage === "burnt") return "Burnt! Click Ingredients to toss it";
  if (item.stage === "raw") return "Click the Oven → Bake";
  const target = targetFor(item, customers);
  if (!target && customers.length) return "No matching order. Store it in Display Case, or Ingredients → Toss and start again";
  if (!item.frosting) return target?.order ? `Click Frosting → ${FROSTINGS[target.order.frosting].name} for ${target.name}` : "Click Frosting to frost it";
  if (target?.order && target.order.topping !== "none" && !item.topping) return `Click Toppings → ${TOPPINGS[target.order.topping].name} for ${target.name}`;
  if (target?.toGo && !item.boxed) return "Click Packaging → Box it to go";
  if (target) return `Click Serving → Serve ${target.name}`;
  return "Store it in Display Case while you wait for a customer";
}

export function createShift({ day, seed, menu, upgrades = {}, discovered = [], onEvent = () => {} }) {
  const level = (id) => upgrades[id] ?? 0;
  const emit = (type, data = {}) => onEvent({ type, ...data });
  let itemSeq = 0;

  const state = {
    // `time` drives the kitchen (oven, heat, actions); `clock` is the day's
    // clock and customer patience, which the tutorial can hold still.
    time: 0,
    clock: 0,
    hold: false,
    length: day.length,
    ended: false,
    coins: 0,
    points: 0,
    served: 0,
    lost: 0,
    chain: 0,
    bestChain: 0,
    saverCharges: level("chainSaver"),
    hands: [],
    handCapacity: level("tray") ? 4 : 2,
    oven: Array.from({ length: RULES.baseOvenSlots + level("ovenRack") }, () => null),
    display: Array.from({ length: RULES.displaySlots }, () => null),
    queue: generateCustomers(day, menu, seed),
    customers: [],
    heat: Object.fromEntries(KITCHEN_NODES.map((node) => [node.id, 0])),
    jammed: new Set(),
    heatWaves: [],
    busy: null,
    discovered: new Set(discovered),
    combosFound: [],
    menu,
    bakeTime: RULES.hotOvenBakeTimes[Math.min(level("hotOven"), RULES.hotOvenBakeTimes.length - 1)],
    walkSpeed: RULES.walkSpeed * (level("skates") ? RULES.skatesMultiplier : 1),
  };
  const patienceMult = level("jukebox") ? 1.25 : 1;
  const tipMult = level("tipJar") ? 1.2 : 1;
  const coolRate = level("fans") ? RULES.heat.fanCoolRate : RULES.heat.coolRate;

  const chainLevel = () => chainLevelFor(state.chain);
  const freeHand = () => state.hands.length < state.handCapacity;
  const heldIndex = (predicate) => state.hands.findIndex(predicate);
  const takeFromHands = (index) => state.hands.splice(index, 1)[0];

  function newItem(flavor) {
    itemSeq += 1;
    return { id: itemSeq, flavor, stage: "raw", frosting: null, topping: null, boxed: false };
  }

  // ---- Heat and the chain reaction -------------------------------------

  function addHeat(stationId, amount) {
    if (!(stationId in state.heat) || !amount) return;
    state.heat[stationId] = Math.min(1, state.heat[stationId] + amount);
    if (state.heat[stationId] >= CRITICAL_THRESHOLD && !state.jammed.has(stationId)) overheat(stationId);
  }

  // A station that overheats takes a full shock, and the cascade engine works
  // out how much of it reaches every station downstream, and when.
  function overheat(stationId) {
    state.jammed.add(stationId);
    emit("overheat", { station: stationId });
    const startDistress = { ...state.heat, [stationId]: 0 };
    const result = simulateCascade(stationId, {
      decay: RULES.heat.cascadeDecay,
      startDistress,
      nodes: KITCHEN_NODES,
      edges: KITCHEN_EDGES,
    });
    for (const event of result.events) {
      state.heatWaves.push({ at: state.time + event.time / 1000, station: event.node, value: event.distress, source: stationId });
    }
  }

  function applyHeatWave(wave) {
    state.heat[wave.station] = Math.max(state.heat[wave.station], wave.value);
    emit("heatWave", { station: wave.station, value: wave.value, source: wave.source });
    if (wave.value >= CRITICAL_THRESHOLD && !state.jammed.has(wave.station)) {
      state.jammed.add(wave.station);
      emit("jammed", { station: wave.station, source: wave.source });
    }
  }

  // ---- Customers ----------------------------------------------------------

  function loseCustomer(customer) {
    state.customers.splice(state.customers.indexOf(customer), 1);
    state.lost += 1;
    emit("customerLeft", { customer });
    if (state.chain === 0) return;
    if (state.saverCharges > 0) {
      state.saverCharges -= 1;
      emit("chainSaved", { chain: state.chain });
      return;
    }
    const brokenChain = state.chain;
    state.chain = 0;
    emit("chainBroken", { chain: brokenChain });
  }

  function serve(customer, itemIndex) {
    const item = takeFromHands(itemIndex);
    state.customers.splice(state.customers.indexOf(customer), 1);
    const combo = comboFor(item);
    const patienceFraction = Math.max(0, customer.patience / customer.patienceMax);
    const orderMult = customer.order ? 1 : RULES.surpriseMultiplier;
    const coins = Math.round(cupcakeValue(item) * orderMult * (0.7 + 0.5 * patienceFraction) * tipMult)
      + (customer.toGo ? RULES.toGoBonus : 0);
    const previousLevel = chainLevel();
    state.chain += 1;
    state.bestChain = Math.max(state.bestChain, state.chain);
    const currentLevel = chainLevel();
    let points = coins * RULES.pointsPerCoin * currentLevel;
    let discoveredCombo = null;
    if (combo && !state.discovered.has(combo.id)) {
      state.discovered.add(combo.id);
      state.combosFound.push(combo.id);
      points += RULES.comboDiscoveryPoints;
      discoveredCombo = combo;
    }
    state.coins += coins;
    state.points += points;
    state.served += 1;
    emit("served", { customer, item, coins, points, combo, chain: state.chain, level: currentLevel });
    if (discoveredCombo) emit("comboDiscovered", { combo: discoveredCombo });

    // The chain reaction: every level-up delights the whole line.
    if (currentLevel > previousLevel) {
      const bonus = RULES.chainReactionPoints * currentLevel;
      state.points += bonus;
      for (const other of state.customers) {
        other.patience = Math.min(other.patienceMax, other.patience + other.patienceMax * 0.4);
      }
      emit("chainReaction", { level: currentLevel, bonus });
    }
  }

  // ---- Station actions ----------------------------------------------------

  const action = (id, label, { detail = "", enabled = true, reason = "", duration = 0.3, heat = 0, run }) => ({
    id, label, detail, enabled, reason, duration, heat, run,
  });

  function stationActions(stationId) {
    const actions = [];
    const heat = state.heat[stationId] ?? 0;
    const jammed = state.jammed.has(stationId);
    const coolAction = action("cool", "Cool it down", {
      detail: "Clears heat",
      duration: RULES.actionTime.cool,
      run: () => {
        state.heat[stationId] = Math.max(0, state.heat[stationId] - RULES.heat.coolAction);
        emit("cooled", { station: stationId });
      },
    });
    if (jammed && stationId !== "oven") return [coolAction];

    if (stationId === "cafeTable") {
      for (const flavor of menu.flavors) {
        actions.push(action(`flavor:${flavor}`, `${FLAVORS[flavor].name} batter`, {
          detail: `${FLAVORS[flavor].value}¢`,
          enabled: freeHand(),
          reason: "Your hands are full",
          duration: RULES.actionTime.flavor,
          heat: RULES.heat.flavor,
          run: () => state.hands.push(newItem(flavor)),
        }));
      }
      if (state.hands.length > 0) {
        const burnt = heldIndex((item) => item.stage === "burnt");
        const index = burnt >= 0 ? burnt : 0;
        actions.push(action("trash", `Toss the ${state.hands[index].stage === "burnt" ? "burnt " : ""}cupcake`, {
          duration: RULES.actionTime.trash,
          run: () => emit("trashed", { item: takeFromHands(index) }),
        }));
      }
    }

    if (stationId === "recipeBook") {
      actions.push(action("book", "Read the recipe book", { duration: 0, run: () => emit("openBook") }));
    }

    if (stationId === "displayCase") {
      const freeSlot = state.display.indexOf(null);
      if (state.hands.length > 0) {
        actions.push(action("store", "Store the cupcake", {
          enabled: freeSlot >= 0,
          reason: "The case is full",
          duration: RULES.actionTime.store,
          heat: RULES.heat.store,
          run: () => {
            const slot = state.display.indexOf(null);
            state.display[slot] = takeFromHands(0);
          },
        }));
      }
      state.display.forEach((item, slot) => {
        if (!item) return;
        actions.push(action(`take:${slot}`, `Take ${describeCupcake(item)}`, {
          enabled: freeHand(),
          reason: "Your hands are full",
          duration: RULES.actionTime.take,
          run: () => {
            state.hands.push(item);
            state.display[slot] = null;
          },
        }));
      });
    }

    if (stationId === "oven") {
      const raw = heldIndex((item) => item.stage === "raw");
      const freeSlot = state.oven.indexOf(null);
      const canBake = !jammed && raw >= 0 && freeSlot >= 0;
      const reason = jammed ? "Cool the oven before baking more" : raw < 0 ? "Bring raw batter from Ingredients" : "The oven is full";
      const batchSize = Math.min(state.hands.filter(item => item.stage === "raw").length, state.oven.filter(slot => !slot).length);
      const bake = (turbo) => () => {
        for (let n = 0; n < batchSize; n += 1) {
        const slot = state.oven.indexOf(null);
        const item = takeFromHands(heldIndex((held) => held.stage === "raw"));
        item.stage = "baking";
        state.oven[slot] = { item, startedAt: state.time, duration: state.bakeTime * (turbo ? 0.5 : 1), turbo };
        emit("ovenIn", { slot, turbo });
        }
      };
      actions.push(action("bake", `Bake ${batchSize > 1 ? `${batchSize} cupcakes ` : ""}(${state.bakeTime}s)`, { enabled: canBake, reason, duration: RULES.actionTime.bake, heat: RULES.heat.bake, run: bake(false) }));
      actions.push(action("turbo", `Turbo bake (${state.bakeTime / 2}s, +heat)`, { enabled: canBake, reason, duration: RULES.actionTime.bake, heat: RULES.heat.turbo, run: bake(true) }));
      const readyItems = state.oven.filter(slot => slot && ["baked", "burnt"].includes(slot.item.stage));
      if (readyItems.length > 1) actions.push(action("takeAll", "Take out ready cupcakes", {
        detail: `Collect up to ${state.handCapacity - state.hands.length}`,
        enabled: freeHand(), reason: "Free space in your hands at Display Case",
        duration: RULES.actionTime.takeOut,
        run: () => {
          for (const slot of readyItems) {
            if (!freeHand()) break;
            state.hands.push(slot.item);
            state.oven[state.oven.indexOf(slot)] = null;
          }
        },
      }));
      // Baked cupcakes come out before burnt ones.
      const readySlot = () => {
        const baked = state.oven.findIndex((slot) => slot?.item.stage === "baked");
        return baked >= 0 ? baked : state.oven.findIndex((slot) => slot?.item.stage === "burnt");
      };
      const takeSlot = readySlot();
      state.oven.forEach((slot, index) => {
        if (!slot || !["baked", "burnt"].includes(slot.item.stage)) return;
        const itemId = slot.item.id;
        const takeAction = action(index === takeSlot ? "takeOut" : `takeOut:${itemId}`, slot.item.stage === "baked" ? "Take out the baked cupcake" : "Take out (burnt!)", {
          detail: `Rack ${index + 1} · ${FLAVORS[slot.item.flavor].name}`,
          enabled: freeHand(),
          reason: "Your hands are full",
          duration: RULES.actionTime.takeOut,
          run: () => {
            const slotIndex = state.oven.findIndex(entry => entry?.item.id === itemId);
            state.hands.push(state.oven[slotIndex].item);
            state.oven[slotIndex] = null;
          },
        });
        takeAction.itemId = itemId;
        actions.push(takeAction);
      });
    }

    if (stationId === "frostingCounter") {
      const index = heldIndex((item) => item.stage === "baked" && !item.frosting);
      for (const frosting of menu.frostings) {
        actions.push(action(`frost:${frosting}`, FROSTINGS[frosting].name, {
          detail: `${FROSTINGS[frosting].value}¢ · ${FROSTINGS[frosting].time}s`,
          enabled: index >= 0,
          reason: "Bring a baked cupcake",
          duration: FROSTINGS[frosting].time,
          heat: RULES.heat.frost,
          run: () => {
            state.hands[heldIndex((item) => item.stage === "baked" && !item.frosting)].frosting = frosting;
          },
        }));
      }
    }

    if (stationId === "decoratingCounter") {
      const index = heldIndex((item) => isFinished(item) && !item.topping);
      for (const topping of menu.toppings.filter((id) => id !== "none")) {
        actions.push(action(`top:${topping}`, TOPPINGS[topping].name, {
          detail: `${TOPPINGS[topping].value}¢ · ${TOPPINGS[topping].time}s`,
          enabled: index >= 0,
          reason: "Bring a frosted cupcake",
          duration: TOPPINGS[topping].time,
          heat: RULES.heat.top,
          run: () => {
            state.hands[heldIndex((item) => isFinished(item) && !item.topping)].topping = topping;
          },
        }));
      }
    }

    if (stationId === "deliveryStation") {
      const index = heldIndex((item) => isFinished(item) && !item.boxed);
      actions.push(action("box", "Box it to go", {
        detail: `+${RULES.toGoBonus}¢ on to-go orders`,
        enabled: index >= 0,
        reason: "Bring a frosted cupcake",
        duration: RULES.actionTime.box,
        heat: RULES.heat.box,
        run: () => {
          state.hands[heldIndex((item) => isFinished(item) && !item.boxed)].boxed = true;
        },
      }));
    }

    if (stationId === "bakeryDoor") {
      state.hands.forEach((item) => {
        for (const customer of state.customers) {
          if (!matchesOrder(item, customer)) continue;
          actions.push(action(`serve:${customer.id}:${item.id}`, `Serve ${customer.name}`, {
            detail: customer.order ? describeCupcake(item) : "Surprise order",
            duration: RULES.actionTime.serve,
            heat: RULES.heat.serve,
            run: () => serve(customer, state.hands.indexOf(item)),
          }));
        }
      });
      if (actions.length === 0) {
        const reason = state.hands.some(isFinished)
          ? "Match the ticket’s cake, frosting and topping; box to-go orders"
          : "Bring a frosted cupcake";
        actions.push(action("noMatch", "Nothing to serve", { enabled: false, reason, run: () => {} }));
      }
    }

    if (jammed || heat >= WARNING_THRESHOLD) actions.push(coolAction);
    return actions;
  }

  function perform(stationId, actionId, { count = 1 } = {}) {
    if (state.ended || state.busy) return false;
    if (!Number.isInteger(count) || count < 1 || count > state.handCapacity) return false;
    if (actionId.startsWith("flavor:") && state.hands.length + count > state.handCapacity) return false;
    if (!actionId.startsWith("flavor:") && count !== 1) return false;
    const chosen = stationActions(stationId).find((entry) => entry.id === actionId || (actionId.startsWith("takeOut:") && entry.itemId === Number(actionId.slice(8))));
    if (!chosen || !chosen.enabled) return false;
    if (chosen.duration <= 0) {
      chosen.run();
      return true;
    }
    state.busy = { stationId, count, actionId: chosen.itemId ? `takeOut:${chosen.itemId}` : actionId, label: chosen.label, startedAt: state.time, until: state.time + chosen.duration };
    emit("busy", { station: stationId, action: actionId });
    return true;
  }

  // Re-checked at completion: a customer may have left, or the station may
  // have jammed, while the player was working.
  function completeBusy(busy) {
    const chosen = stationActions(busy.stationId).find((entry) => entry.id === busy.actionId || (busy.actionId.startsWith("takeOut:") && entry.itemId === Number(busy.actionId.slice(8))));
    if (!chosen || !chosen.enabled || (busy.actionId.startsWith("flavor:") && state.hands.length + busy.count > state.handCapacity)) {
      emit("actionFailed", { station: busy.stationId, action: busy.actionId });
      return;
    }
    for (let n = 0; n < busy.count; n += 1) chosen.run();
    emit("actionDone", { station: busy.stationId, action: busy.actionId });
    addHeat(busy.stationId, chosen.heat * busy.count);
  }

  // ---- Time -------------------------------------------------------------------

  function summary() {
    const perfect = state.lost === 0 && state.served >= 3;
    return {
      coins: state.coins,
      points: state.points,
      served: state.served,
      lost: state.lost,
      bestChain: state.bestChain,
      combosFound: [...state.combosFound],
      perfect,
    };
  }

  function end() {
    state.ended = true;
    state.busy = null;
    const result = summary();
    if (result.perfect) {
      state.points += RULES.perfectDayPoints;
      result.points = state.points;
    }
    emit("shiftEnd", { summary: result });
  }

  function tick(dt) {
    if (state.ended) return;
    state.time += dt;
    if (!state.hold) state.clock = Math.min(state.length, state.clock + dt);

    if (state.busy && state.time >= state.busy.until) {
      const busy = state.busy;
      state.busy = null;
      completeBusy(busy);
    }

    while (state.queue.length && state.queue[0].arriveAt <= state.clock && state.customers.length < MAX_CUSTOMERS_INSIDE) {
      const customer = state.queue.shift();
      customer.patienceMax = day.patience * patienceMult;
      customer.patience = customer.patienceMax;
      state.customers.push(customer);
      emit("customerArrived", { customer });
    }

    for (const customer of state.hold ? [] : [...state.customers]) {
      customer.patience -= dt;
      if (customer.patience <= 0) loseCustomer(customer);
    }

    state.oven.forEach((slot, index) => {
      if (!slot) return;
      const elapsed = state.time - slot.startedAt;
      if (slot.item.stage === "baking" && elapsed >= slot.duration) {
        slot.item.stage = "baked";
        emit("ovenDone", { slot: index });
      }
      // Not an else: a long frame (e.g. a backgrounded tab) can cross both.
      if (slot.item.stage === "baked" && elapsed >= slot.duration + RULES.burnGrace) {
        slot.item.stage = "burnt";
        emit("burnt", { slot: index });
      }
    });

    state.heatWaves = state.heatWaves.filter((wave) => {
      if (wave.at > state.time) return true;
      applyHeatWave(wave);
      return false;
    });

    for (const id of Object.keys(state.heat)) {
      state.heat[id] = Math.max(0, state.heat[id] - coolRate * dt);
      if (state.jammed.has(id) && state.heat[id] < RULES.heat.unjamBelow) {
        state.jammed.delete(id);
        emit("recovered", { station: id });
      }
    }

    if (state.clock >= state.length) end();
  }

  return {
    state,
    tick,
    perform,
    stationActions,
    chainLevel,
    summary,
    setHold: (value) => {
      state.hold = Boolean(value);
    },
    stationTitle: (id) => stationById(id)?.title ?? id,
  };
}
