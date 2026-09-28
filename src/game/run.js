// A whole run: five days for solo play, or one shared shift per player in a
// Bake-Off. Tracks coins, score, upgrades, unlocked menu items, and combos.

import { BAKE_OFF_BUDGET, BAKE_OFF_DAY, DAYS, FLAVORS, FROSTINGS, FULL_MENU, STARTING_MENU, TOPPINGS, UPGRADES } from "./data.js";

const MENU_TABLES = { flavors: FLAVORS, frostings: FROSTINGS, toppings: TOPPINGS };
const MENU_KIND_LABEL = { flavors: "batter", frostings: "frosting", toppings: "topping" };

const copyMenu = (menu) => ({ flavors: [...menu.flavors], frostings: [...menu.frostings], toppings: [...menu.toppings] });

export function createRun({ mode = "solo", seed, name = "" }) {
  return {
    mode,
    seed,
    name,
    day: 1,
    coins: mode === "vs" ? BAKE_OFF_BUDGET : 0,
    score: 0,
    upgrades: {},
    menu: copyMenu(mode === "vs" ? FULL_MENU : STARTING_MENU),
    discovered: [],
    history: [],
    over: false,
    won: false,
  };
}

export const totalDays = (run) => (run.mode === "vs" ? 1 : DAYS.length);

export function dayConfig(run) {
  return run.mode === "vs" ? BAKE_OFF_DAY : DAYS[run.day - 1];
}

// Same seed + same day = same customers (that's what makes a Bake-Off fair).
export function daySeed(run) {
  return (run.seed + run.day * 7919) >>> 0;
}

export function shopItems(run) {
  const items = UPGRADES.map((upgrade) => {
    const level = run.upgrades[upgrade.id] ?? 0;
    const maxed = level >= upgrade.costs.length;
    const cost = maxed ? null : upgrade.costs[level];
    return {
      id: upgrade.id,
      kind: "upgrade",
      name: upgrade.costs.length > 1 ? `${upgrade.name} ${"I".repeat(Math.min(level + 1, upgrade.costs.length))}` : upgrade.name,
      desc: upgrade.desc,
      cost,
      level,
      maxed,
      affordable: !maxed && run.coins >= cost,
    };
  });
  if (run.mode === "vs") return items;
  for (const [kind, table] of Object.entries(MENU_TABLES)) {
    for (const [id, entry] of Object.entries(table)) {
      if (!entry.cost) continue;
      const owned = run.menu[kind].includes(id);
      items.push({
        id: `menu:${kind}:${id}`,
        kind: "menu",
        name: `${entry.name} ${MENU_KIND_LABEL[kind]}`,
        desc: `New on the menu: worth ${entry.value}¢ and part of a secret combo.`,
        cost: owned ? null : entry.cost,
        level: owned ? 1 : 0,
        maxed: owned,
        affordable: !owned && run.coins >= entry.cost,
      });
    }
  }
  return items;
}

export function buy(run, itemId) {
  const item = shopItems(run).find((entry) => entry.id === itemId);
  if (!item || !item.affordable) return false;
  run.coins -= item.cost;
  if (item.kind === "menu") {
    const [, kind, id] = itemId.split(":");
    run.menu[kind].push(id);
  } else {
    run.upgrades[item.id] = (run.upgrades[item.id] ?? 0) + 1;
  }
  return true;
}

export function starsFor(coins, goal) {
  if (!goal) return 0;
  if (coins >= goal * 2) return 3;
  if (coins >= goal * 1.5) return 2;
  if (coins >= goal) return 1;
  return 0;
}

export function finishDay(run, summary) {
  const goal = dayConfig(run).goal;
  const stars = starsFor(summary.coins, goal);
  run.coins += summary.coins;
  run.score += summary.points;
  run.discovered = [...new Set([...run.discovered, ...summary.combosFound])];
  run.history.push({ day: run.day, goal, stars, ...summary });

  if (run.mode === "vs") {
    run.over = true;
    return { goal, stars, goalMet: true };
  }
  const goalMet = summary.coins >= goal;
  if (!goalMet) {
    run.over = true;
  } else if (run.day >= DAYS.length) {
    run.over = true;
    run.won = true;
  } else {
    run.day += 1;
  }
  return { goal, stars, goalMet };
}
