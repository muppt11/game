// HTML for the between-shift screens, built from run and shift data.

import { COMBOS, DAYS, FLAVORS, FROSTINGS, TOPPINGS, UPGRADES } from "./data.js";
import { shopItems, totalDays } from "./run.js";
import { escapeHtml } from "./ui.js";

export const DAY_TITLES = ["Opening Day", "Rush Hour", "The Regulars", "Critic Week", "Grand Finale"];
const DAY_TIPS = [
  [
    "Ingredients → Oven → Frosting → Toppings → Serving. Pop-up tips will walk you through your first order.",
    "Click a station, choose a recipe, then gather ingredients, stir, pipe frosting, and decorate in the close-up. Follow the large button; finishing takes you to the next station. Watch the oven, take the cupcake out when it dings, and send finished orders along the serving belt. (Keyboard shortcuts are optional - they're shown in the corner of each station.)",
    "Don't leave cupcakes in the oven too long - they burn!",
    "Serve 3 customers in a row for your first <strong>streak bonus</strong>.",
  ],
  [
    "🎁 <strong>To-go orders</strong> start today: box them at Packaging first.",
    "Turbo bake is twice as fast, but it heats the oven. Two in a row and it overheats - and the heat spreads.",
  ],
  ["More customers ask for <strong>secret combos</strong>. Visit the Recipe Book station for hints."],
  ["Customers are getting impatient. Use the Display Case to bake ahead."],
  ["The last and busiest day. Keep that streak alive!"],
];

const stars = (count, max = 3) => `<span class="stars" aria-label="${count} of ${max} stars">${"★".repeat(count)}<span class="stars-empty">${"★".repeat(max - count)}</span></span>`;

export function dayIntroHtml(run, config) {
  if (run.mode === "vs") {
    return `<p class="lead">You have <strong>${config.length} seconds</strong>. Both bakers get the exact same customers - highest score wins.</p>
      <ul class="tip-list"><li>Every serve in a row grows your streak multiplier - don't let anyone walk out.</li>
      <li>Secret combos and "Surprise me!" customers are where the big points are.</li></ul>`;
  }
  const tips = DAY_TIPS[run.day - 1] ?? [];
  return `<p class="lead">Earn <strong>${config.goal}¢</strong> today to open again tomorrow. When the timer ends, visit the shop and continue to the next day.</p>
    <div class="goal-stars"><span>${stars(1)} ${config.goal}¢</span><span>${stars(2)} ${Math.ceil(config.goal * 1.5)}¢</span><span>${stars(3)} ${config.goal * 2}¢</span></div>
    ${tips.length ? `<ul class="tip-list">${tips.map((tip) => `<li>${tip}</li>`).join("")}</ul>` : ""}`;
}

export function summaryHtml(run, summary, outcome) {
  const combos = summary.combosFound.map((id) => COMBOS.find((combo) => combo.id === id)?.name).filter(Boolean);
  const rows = [
    ["Coins earned", `${summary.coins}¢${outcome.goal ? ` <small>/ ${outcome.goal}¢ goal</small>` : ""}`],
    ["Customers served", summary.served],
    ["Customers lost", summary.lost],
    ["Best streak", `${summary.bestChain} in a row`],
    ["New secret combos", combos.length ? escapeHtml(combos.join(", ")) : "None"],
    ...(summary.perfect ? [["Perfect day bonus", "+500 points"]] : []),
    ["Score this shift", summary.points.toLocaleString()],
    ...(run.mode === "solo" ? [["Total score", run.score.toLocaleString()]] : []),
  ];
  return `${run.mode === "solo" ? `<div class="summary-stars">${stars(outcome.stars)}</div>` : ""}
    <dl class="stat-grid">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

export function shopHtml(run) {
  const items = shopItems(run);
  const card = (item) => `<button type="button" class="shop-item ${item.maxed ? "is-owned" : ""}" data-buy="${item.id}" ${item.affordable ? "" : "disabled"}>
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.desc)}</span>
      <em>${item.maxed ? "Owned ✓" : `${item.cost}¢${item.affordable ? "" : " - need more coins"}`}</em>
    </button>`;
  const upgrades = items.filter((item) => item.kind === "upgrade");
  const menu = items.filter((item) => item.kind === "menu");
  return `<p class="shop-coins">You have <strong id="shop-coins">${run.coins}¢</strong></p>
    <h3>Kitchen upgrades</h3><div class="shop-grid">${upgrades.map(card).join("")}</div>
    ${menu.length ? `<h3>New ingredients</h3><div class="shop-grid">${menu.map(card).join("")}</div>` : ""}`;
}

export function bookHtml(discovered, menu) {
  const all = { flavors: FLAVORS, frostings: FROSTINGS, toppings: TOPPINGS };
  const onMenu = (combo) => menu.flavors.includes(combo.flavor) && menu.frostings.includes(combo.frosting) && menu.toppings.includes(combo.topping);
  return `<p class="lead">Serve a secret combo for a big value multiplier. Found ${discovered.size} of ${COMBOS.length}.</p>
    <ul class="book-list">${COMBOS.map((combo) => {
      const found = discovered.has(combo.id);
      const parts = [all.flavors[combo.flavor].name, all.frostings[combo.frosting].name, all.toppings[combo.topping].name];
      return `<li class="${found ? "is-found" : ""}">
        <strong>${found ? escapeHtml(combo.name) : "???"}</strong>
        <span>${found ? escapeHtml(parts.join(" + ")) : `Hint: starts with ${escapeHtml(parts[0])} batter${onMenu(combo) ? "" : " · needs an ingredient from the shop"}`}</span>
        <em>×${combo.mult}</em>
      </li>`;
    }).join("")}</ul>`;
}

export function runEndHtml(run, { newRecord, best }) {
  const days = run.history.map((entry) => `<li><span>Day ${entry.day} · ${DAY_TITLES[entry.day - 1]}</span><span>${entry.coins}¢ / ${entry.goal}¢ ${stars(entry.stars)}</span></li>`).join("");
  return `<p class="final-score"><span>Final score</span><strong>${run.score.toLocaleString()}</strong>${newRecord ? '<em class="record">New best score!</em>' : `<small>Best: ${best.toLocaleString()}</small>`}</p>
    <ul class="day-list">${days}</ul>
    <p class="lead">Secret combos found: ${run.discovered.length} of ${COMBOS.length} · Days survived: ${run.history.filter((entry) => entry.coins >= entry.goal).length} of ${totalDays(run)}</p>`;
}

export function vsSetupHtml(names) {
  return `<p class="lead">Two bakers, one kitchen. Each of you gets <strong>150¢</strong> to spend on upgrades, then one 100-second shift with the <strong>same customers</strong>. Highest score wins.</p>
    <div class="name-fields">
      <label>Baker 1 <input type="text" id="vs-name-0" maxlength="14" value="${escapeHtml(names[0])}" autocomplete="off" autofocus /></label>
      <label>Baker 2 <input type="text" id="vs-name-1" maxlength="14" value="${escapeHtml(names[1])}" autocomplete="off" /></label>
    </div>`;
}

export function vsResultsHtml(vs) {
  const [a, b] = vs.runs.map((run) => ({ run, result: run.history[0] }));
  const rows = [
    ["Score", (entry) => entry.run.score.toLocaleString()],
    ["Coins earned", (entry) => `${entry.result.coins}¢`],
    ["Customers served", (entry) => entry.result.served],
    ["Customers lost", (entry) => entry.result.lost],
    ["Best streak", (entry) => entry.result.bestChain],
    ["Secret combos", (entry) => entry.result.combosFound.length],
    ["Upgrades bought", (entry) => Object.values(entry.run.upgrades).reduce((sum, level) => sum + level, 0)],
  ];
  return `<table class="vs-table"><thead><tr><th></th><th>${escapeHtml(vs.names[0])}</th><th>${escapeHtml(vs.names[1])}</th></tr></thead>
    <tbody>${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value(a)}</td><td>${value(b)}</td></tr>`).join("")}</tbody></table>`;
}

export function upgradesOwnedHtml(run) {
  const owned = UPGRADES.filter((upgrade) => run.upgrades[upgrade.id]).map((upgrade) => `${upgrade.name}${upgrade.costs.length > 1 ? ` ${"I".repeat(run.upgrades[upgrade.id])}` : ""}`);
  return owned.length ? `<p class="owned-note">Your kitchen: ${escapeHtml(owned.join(" · "))}</p>` : "";
}

export const dayCount = DAYS.length;
