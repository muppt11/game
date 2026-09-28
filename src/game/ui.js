// DOM pieces of the game: the shift HUD, the order tickets, the station action
// panel, and the one reusable dialog every between-shift screen is drawn in.

import { COMBOS, FLAVORS, FROSTINGS, RULES, TOPPINGS, stationById } from "./data.js";
import { chainLevelFor, targetFor } from "./shift.js";

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const formatTime = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function swatch(color) {
  return `<i class="swatch" style="--swatch:${color ?? "transparent"}"></i>`;
}

export function describeItem(item) {
  if (!item) return "Nothing";
  if (item.stage === "burnt") return `Burnt ${FLAVORS[item.flavor].name.toLowerCase()} cupcake`;
  const parts = [`${FLAVORS[item.flavor].name}${item.stage === "raw" ? " batter" : ""}`];
  if (item.frosting) parts.push(`${FROSTINGS[item.frosting].name} frosting`);
  if (item.topping) parts.push(TOPPINGS[item.topping].name);
  if (item.boxed) parts.push("boxed");
  return parts.join(" · ");
}

// ---- HUD ---------------------------------------------------------------------

export function createHud(elements) {
  const last = {};
  const set = (key, element, value, property = "textContent") => {
    if (last[key] === value) return;
    last[key] = value;
    element[property] = value;
  };
  return {
    update({ shift, dayLabel, playerLabel, goal }) {
      const { state } = shift;
      set("day", elements.day, dayLabel);
      set("player", elements.player, playerLabel ? ` · ${playerLabel}` : "");
      set("time", elements.timeText, state.hold ? "Paused for tutorial" : formatTime(state.length - state.clock));
      const remaining = 1 - state.clock / state.length;
      elements.timeFill.style.width = `${remaining * 100}%`;
      set("urgent", elements.timeFill.parentElement.dataset, String(remaining < 0.15), "urgent");
      set("coins", elements.coins, String(state.coins));
      set("goal", elements.goal, goal ? ` / ${goal}¢` : "¢");
      set("goalMet", elements.coins.parentElement.dataset, String(goal > 0 && state.coins >= goal), "met");
      const goalPercent = goal > 0 ? Math.min(100, Math.round((state.coins / goal) * 100)) : 0;
      elements.goalBar.hidden = !goal;
      if (last.goalPercent !== goalPercent) {
        last.goalPercent = goalPercent;
        elements.goalFill.style.width = `${goalPercent}%`;
        elements.goalBar.setAttribute("aria-valuenow", String(goalPercent));
        elements.goalBar.dataset.met = String(goalPercent >= 100);
      }
      set("score", elements.score, state.points.toLocaleString());
      const level = chainLevelFor(state.chain);
      set("mult", elements.mult, `×${level}`);
      set("level", elements.meter.dataset, String(level), "level");
      const intoLevel = level >= RULES.maxChainLevel ? RULES.chainStep : state.chain % RULES.chainStep;
      set("pips", elements.pips, Array.from({ length: RULES.chainStep }, (_, index) => `<span class="${index < intoLevel ? "is-on" : ""}"></span>`).join(""), "innerHTML");
      set("count", elements.count, `${state.chain} in a row`);
    },
    reset() {
      Object.keys(last).forEach((key) => delete last[key]);
    },
  };
}

// ---- Recipe progress: where the current cupcake is in the line ----------------

export function renderRecipeProgress(list, shift) {
  const { hands, oven, customers } = shift.state;
  const item = hands.find((held) => held.stage !== "raw") ?? hands[0] ?? oven.find(Boolean)?.item ?? null;
  const target = targetFor(item, customers);
  const wantsTopping = target?.order ? target.order.topping !== "none" : false;
  const burnt = item?.stage === "burnt";
  const steps = [
    ["Batter", Boolean(item)],
    [burnt ? "Burnt!" : "Bake", Boolean(item && (item.stage === "baked" || burnt))],
    ["Frost", Boolean(item?.frosting)],
    ...(wantsTopping ? [["Topping", Boolean(item?.topping)]] : []),
    ...(target?.toGo ? [["Box", Boolean(item?.boxed)]] : []),
    ["Serve", false],
  ];
  const currentIndex = burnt ? 1 : steps.findIndex(([, done]) => !done);
  const html = steps.map(([label, done], index) => {
    const state = burnt && index === 1 ? "is-burnt" : done ? "is-done" : index === currentIndex ? "is-current" : "is-todo";
    const symbol = state === "is-burnt" ? "✕" : done ? "✓" : index === currentIndex ? "→" : "○";
    const spoken = state === "is-burnt" ? "burnt" : done ? "done" : index === currentIndex ? "next" : "to do";
    return `<li class="${state}"><span aria-hidden="true">${symbol}</span>${label}<span class="visually-hidden"> (${spoken})</span></li>`;
  }).join("");
  if (list.innerHTML !== html) list.innerHTML = html;
}

// ---- Order tickets -------------------------------------------------------------

const FACE_SKINS = ["#f2c4a8", "#c98262", "#7c4b3a", "#e0a477"];
const FACE_HAIR = ["#623f36", "#3b2520", "#bd5656", "#f2cf83", "#7695a8"];
const moodFor = (fraction) => (fraction > 0.6 ? "happy" : fraction > 0.3 ? "meh" : "grumpy");

// A tiny pixel customer whose face changes as they wait (Papa's-style).
function customerFace(customer) {
  const skin = FACE_SKINS[customer.id % FACE_SKINS.length];
  const hair = FACE_HAIR[(customer.id * 3) % FACE_HAIR.length];
  return `<span class="ticket-face" data-mood="happy" style="--skin:${skin};--hair:${hair}" aria-hidden="true"><i class="face-eyes"></i><i class="face-mouth"></i></span>`;
}

export function renderOrders(rail, shift, discovered) {
  const { customers, queue, clock: time } = shift.state;
  const colorblind = document.body.dataset.palette === "colorblind";
  const color = (entry) => (colorblind ? entry.cbColor : null) ?? entry.color;
  const signature = customers.map((customer) => customer.id).join(",") + `|${[...discovered].join(",")}|${colorblind}`;
  if (rail.dataset.signature !== signature) {
    rail.dataset.signature = signature;
    rail.innerHTML = customers.map((customer) => {
      const combo = customer.comboId ? COMBOS.find((entry) => entry.id === customer.comboId) : null;
      const comboLabel = combo ? (discovered.has(combo.id) ? `★ ${combo.name}` : "★ Secret combo!") : "";
      const lines = customer.order
        ? [
          `${swatch(color(FLAVORS[customer.order.flavor]))}${FLAVORS[customer.order.flavor].name}`,
          `${swatch(color(FROSTINGS[customer.order.frosting]))}${FROSTINGS[customer.order.frosting].name}`,
          customer.order.topping === "none" ? `${swatch(null)}Plain` : `${swatch(color(TOPPINGS[customer.order.topping]))}${TOPPINGS[customer.order.topping].name}`,
        ]
        : ["Surprise me!", `<span class="ticket-note">Anything frosted · +${Math.round((RULES.surpriseMultiplier - 1) * 100)}%</span>`];
      const label = customer.order
        ? `${customer.name} wants ${lines.map((line) => line.replace(/<[^>]+>/g, "")).join(", ")}${customer.toGo ? ", to go" : ""}`
        : `${customer.name} says surprise me${customer.toGo ? ", to go" : ""}`;
      return `<li class="order-ticket ${customer.order ? "" : "is-surprise"}" data-customer="${customer.id}" aria-label="${escapeHtml(label)}">
        <span class="ticket-head">${customerFace(customer)}<strong>${escapeHtml(customer.name)}</strong>${customer.toGo ? '<span class="ticket-togo">🎁 To go</span>' : ""}</span>
        ${comboLabel ? `<span class="ticket-combo">${escapeHtml(comboLabel)}</span>` : ""}
        <span class="ticket-lines">${lines.map((line) => `<span>${line}</span>`).join("")}</span>
        <span class="ticket-patience"><span></span></span>
      </li>`;
    }).join("") + (queue.some((customer) => customer.arriveAt <= time) ? `<li class="order-ticket is-waiting" aria-label="More customers waiting outside"><span>+${queue.filter((customer) => customer.arriveAt <= time).length}</span><small>waiting</small></li>` : "");
  }
  for (const customer of customers) {
    const ticket = rail.querySelector(`[data-customer="${customer.id}"]`);
    if (!ticket) continue;
    const fraction = Math.max(0, customer.patience / customer.patienceMax);
    ticket.querySelector(".ticket-patience span").style.width = `${fraction * 100}%`;
    ticket.classList.toggle("is-urgent", fraction < 0.3);
    const face = ticket.querySelector(".ticket-face");
    const mood = moodFor(fraction);
    if (face && face.dataset.mood !== mood) face.dataset.mood = mood;
  }
}

// ---- Station panel -----------------------------------------------------------

function stationStatus(shift, stationId) {
  const { state } = shift;
  const parts = [];
  if (state.jammed.has(stationId)) return "Overheated! Cool it down before you can use it again.";
  if (stationId === "oven") {
    parts.push(state.oven.map((slot, index) => {
      if (!slot) return `Rack ${index + 1}: empty`;
      const left = slot.startedAt + slot.duration - state.time;
      if (slot.item.stage === "baking") return `Rack ${index + 1}: ${Math.ceil(left)}s`;
      if (slot.item.stage === "baked") return `Rack ${index + 1}: ready!`;
      return `Rack ${index + 1}: burnt`;
    }).join(" · "));
  }
  if (stationId === "displayCase") parts.push(`${state.display.filter(Boolean).length}/${state.display.length} slots used`);
  const heat = state.heat[stationId];
  if (heat !== undefined && heat >= 0.05) parts.push(`Heat ${Math.round(heat * 100)}%${heat >= 0.25 ? " - careful!" : ""}`);
  return parts.join(" · ");
}

export function createStationPanel({ panel, kicker, title, status, actions, onAction }) {
  let stationId = null;
  let signature = "";

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button && !button.disabled) onAction(stationId, button.dataset.action);
  });

  // The menu sits on its own station (like a Papa's station screen), so it
  // never covers the next station in the line. Kept inside the kitchen area.
  function position() {
    const station = stationById(stationId);
    const height = panel.offsetHeight || 150;
    const top = Math.min(Math.max(station.y - height / 2 + 4, 116), 534 - height);
    panel.style.left = `${Math.min(Math.max(station.x, 160), 800)}px`;
    panel.style.top = `${top}px`;
  }

  return {
    get stationId() {
      return stationId;
    },
    show(id, shift) {
      stationId = id;
      signature = "";
      const station = stationById(id);
      kicker.textContent = `${station.key.toUpperCase()} · ${station.role}`;
      title.textContent = station.title;
      position();
      panel.hidden = false;
      this.refresh(shift);
    },
    hide() {
      stationId = null;
      panel.hidden = true;
    },
    refresh(shift) {
      if (!stationId) return;
      const list = shift.stationActions(stationId);
      const statusText = stationStatus(shift, stationId);
      const busy = Boolean(shift.state.busy);
      const next = JSON.stringify([busy, list.map((entry) => [entry.id, entry.label, entry.detail, entry.enabled, entry.reason])]);
      panel.classList.toggle("is-busy", busy && shift.state.busy.stationId === stationId);
      status.textContent = statusText;
      status.hidden = !statusText;
      if (next === signature) return;
      signature = next;
      const focusedAction = document.activeElement?.closest?.("#station-actions button")?.dataset.action;
      status.textContent = statusText;
      status.hidden = !statusText;
      actions.innerHTML = list.map((entry, index) => `
        <button type="button" data-action="${escapeHtml(entry.id)}" ${entry.enabled && !busy ? "" : "disabled"} class="${entry.id === "cool" ? "is-cool" : ""}">
          <kbd>${index + 1}</kbd><span class="action-label">${escapeHtml(entry.label)}</span>
          ${entry.enabled ? (entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : "") : `<small class="action-reason">${escapeHtml(entry.reason)}</small>`}
        </button>`).join("");
      if (focusedAction) actions.querySelector(`[data-action="${CSS.escape(focusedAction)}"]`)?.focus();
      position();
    },
    actionAt(index, shift) {
      if (!stationId) return null;
      return shift.stationActions(stationId)[index]?.id ?? null;
    },
  };
}

// ---- The reusable screen dialog ------------------------------------------------

export function createScreens({ dialog, paper, kicker, title, body, actions }) {
  let onCancel = null;
  let handlers = [];

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    onCancel?.();
  });
  actions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (button) handlers[Number(button.dataset.index)]?.();
  });

  return {
    get open() {
      return dialog.open;
    },
    show({ kicker: kickerText, title: titleText, html = "", buttons = [], cancel = null, wide = false, onRender }) {
      kicker.textContent = kickerText;
      title.textContent = titleText;
      body.innerHTML = html;
      paper.classList.toggle("is-wide", wide);
      handlers = buttons.map((button) => button.onClick);
      actions.innerHTML = buttons.map((button, index) => `<button type="button" data-index="${index}" class="${button.primary ? "start-button" : "default-button"}">${escapeHtml(button.label)}</button>`).join("");
      onCancel = cancel;
      if (!dialog.open) dialog.showModal();
      onRender?.(body);
      const primary = actions.querySelector(".start-button") ?? actions.querySelector("button");
      window.requestAnimationFrame(() => (body.querySelector("[autofocus]") ?? primary)?.focus());
    },
    close() {
      onCancel = null;
      if (dialog.open) dialog.close();
    },
  };
}
