import "./style.css";
import "./game.css";
import { NODES as LAB_NODES, createChainReactionLab } from "./chainReaction";
import { isNarratorEnabled, narratorSupported, speak, toggleNarrator } from "./narrator";
import { playSound, setupAudio } from "./audio";
import { getCharacterLook, setupCharacterDialog } from "./character";
import { STATIONS, describeCupcake, stationById } from "./game/data";
import { createRun, dayConfig, daySeed, buy, finishDay, totalDays } from "./game/run";
import { randomSeed } from "./game/rng";
import { createShift, hintFor } from "./game/shift";
import { PALETTES, createBakeryScene } from "./game/scene";
import { createHud, createScreens, createStationPanel, describeItem, escapeHtml, renderOrders, renderRecipeProgress } from "./game/ui";
import { createCoach } from "./game/coach";
import { DAY_TITLES, bookHtml, dayIntroHtml, runEndHtml, shopHtml, summaryHtml, upgradesOwnedHtml, vsResultsHtml, vsSetupHtml } from "./game/screens";

const $ = (selector) => document.querySelector(selector);

const TEXT_SIZE_KEY = "tanvis-code-bakery-text-size";
const PALETTE_KEY = "crb-palette";
const HIGH_SCORE_KEY = "crb-high-score";
const TEXT_SIZES = [
  { id: "normal", scale: 1, label: "100%" },
  { id: "large", scale: 1.15, label: "115%" },
  { id: "xlarge", scale: 1.3, label: "130%" },
  { id: "xxlarge", scale: 1.5, label: "150%" },
];
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const FINE_POINTER = window.matchMedia("(pointer: fine)");

const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable - the setting lasts for this visit only.
    }
  },
};

const shell = $("#game-shell");
const welcomePanel = $("#welcome-panel");
const welcomeBest = $("#welcome-best");
const soloButton = $("#solo-button");
const shiftLayer = $("#shift-layer");
const shiftBanner = $("#shift-banner");
const chainMeter = $("#chain-meter");
const orderRail = $("#order-rail");
const heldText = $("#held-text");
const heldHint = $("#held-hint");
const recipeProgress = $("#recipe-progress");
const statusLive = $("#status-live");
const pauseButton = $("#pause-button");
const textSizeToggle = $("#text-size-toggle");
const paletteToggle = $("#palette-toggle");
const narratorToggle = $("#narrator-toggle");
const howToDialog = $("#how-to-dialog");
const gameDialogBody = $("#game-dialog-body");
const confettiLayer = $("#confetti-layer");

// ---- Settings: font size, colors, narrator, screen scale ----------------------

let textSize = TEXT_SIZES.find((size) => size.id === store.get(TEXT_SIZE_KEY, "normal")) ?? TEXT_SIZES[0];
let paletteId = store.get(PALETTE_KEY, "standard") === "colorblind" ? "colorblind" : "standard";

function applyTextSize() {
  document.body.dataset.textSize = textSize.id;
  document.documentElement.style.setProperty("--text-scale", String(textSize.scale));
  textSizeToggle.textContent = `Font size ${textSize.label}`;
  const next = TEXT_SIZES[(TEXT_SIZES.indexOf(textSize) + 1) % TEXT_SIZES.length];
  textSizeToggle.setAttribute("aria-label", `Font size ${textSize.label}. Change to ${next.label}.`);
}

function applyPalette() {
  document.body.dataset.palette = paletteId;
  paletteToggle.textContent = paletteId === "colorblind" ? "Colors: Colorblind-safe" : "Colors: Standard";
  paletteToggle.setAttribute("aria-pressed", String(paletteId === "colorblind"));
  chainLab?.setColorblindMode(paletteId === "colorblind");
}

textSizeToggle.addEventListener("click", () => {
  textSize = TEXT_SIZES[(TEXT_SIZES.indexOf(textSize) + 1) % TEXT_SIZES.length];
  store.set(TEXT_SIZE_KEY, textSize.id);
  applyTextSize();
});
paletteToggle.addEventListener("click", () => {
  paletteId = paletteId === "colorblind" ? "standard" : "colorblind";
  store.set(PALETTE_KEY, paletteId);
  applyPalette();
});

function updateNarratorToggle() {
  const on = isNarratorEnabled();
  narratorToggle.textContent = on ? "🔈 Narrator" : "🔇 Narrator";
  narratorToggle.setAttribute("aria-pressed", String(on));
  narratorToggle.setAttribute("aria-label", on ? "Turn voice narrator off" : "Turn voice narrator on");
}
if (narratorSupported) {
  narratorToggle.hidden = false;
  updateNarratorToggle();
  narratorToggle.addEventListener("click", () => {
    const on = toggleNarrator();
    updateNarratorToggle();
    if (on) speak(`Narrator on. ${narratorContext()}`);
  });
}

// Everything is sized for a 960x540 game; scale it all up to fill the screen.
new ResizeObserver(() => {
  const scale = shell.clientWidth / 960;
  shell.style.setProperty("--shell-scale", String(scale));
  document.documentElement.style.setProperty("--ui-zoom", String(Math.min(2, Math.max(0.7, scale))));
}).observe(shell);

// Screen-reader status line, also read aloud when the narrator is on.
function announce(message) {
  statusLive.textContent = message;
  speak(message);
}

// ---- Game state ----------------------------------------------------------------

let phase = "menu"; // menu | countdown | shift | paused | screen
let run = null;
let vs = null;
let shift = null;
let countdown = 0;
let currentScreen = null;
let bannerTimer = null;

const hud = createHud({
  day: $("#hud-day"),
  player: $("#hud-player"),
  timeText: $("#hud-timer-text"),
  timeFill: $("#hud-timer-fill"),
  coins: $("#hud-coins"),
  goal: $("#hud-goal"),
  score: $("#hud-score"),
  meter: chainMeter,
  mult: $("#chain-mult"),
  pips: $("#chain-pips"),
  count: $("#chain-count"),
  goalBar: $("#goal-bar"),
  goalFill: $("#goal-bar-fill"),
});

const screens = createScreens({
  dialog: $("#game-dialog"),
  paper: $("#game-paper"),
  kicker: $("#game-dialog-kicker"),
  title: $("#game-dialog-title"),
  body: gameDialogBody,
  actions: $("#game-dialog-actions"),
});

function performAction(stationId, actionId) {
  if (phase !== "shift" || !shift) return;
  if (shift.perform(stationId, actionId)) panel.refresh(shift);
}

const panel = createStationPanel({
  panel: $("#station-panel"),
  kicker: $("#station-panel-kicker"),
  title: $("#station-panel-title"),
  status: $("#station-panel-status"),
  actions: $("#station-actions"),
  onAction: performAction,
});

const scene = createBakeryScene({
  getShift: () => shift,
  getCharacter: getCharacterLook,
  getTextScale: () => textSize.scale,
  getPalette: () => PALETTES[paletteId],
  isPaused: () => phase !== "shift",
  onArrive: (stationId) => {
    if (!shift) return;
    if (stationId === "recipeBook") openBook();
    else panel.show(stationId, shift);
  },
  onLeave: () => panel.hide(),
  onClickSound: () => playSound("click"),
  onFrame: (dt) => gameFrame(dt),
});

const coach = createCoach({
  bubble: $("#coach-bubble"),
  kicker: $("#coach-kicker"),
  text: $("#coach-text"),
  okButton: $("#coach-ok"),
  skipButton: $("#coach-skip"),
  scene,
  announce: (message) => announce(message),
});

const shiftLabel = () => (run.mode === "vs" ? "Bake-Off" : `Day ${run.day} · ${DAY_TITLES[run.day - 1]}`);

function narratorContext() {
  if (!shift) return "Welcome to Tanvi's Cupcake Rush.";
  return `${shiftLabel()}. ${shift.state.coins} coins so far. ${hintFor(shift.state.hands[0], shift.state.customers, shift.state.oven)}.`;
}

function showBanner(text, kind = "", duration = 1500) {
  window.clearTimeout(bannerTimer);
  shiftBanner.textContent = text;
  shiftBanner.dataset.kind = kind;
  shiftBanner.hidden = false;
  shiftBanner.classList.remove("is-showing");
  void shiftBanner.offsetWidth;
  shiftBanner.classList.add("is-showing");
  if (duration) bannerTimer = window.setTimeout(() => {
    shiftBanner.hidden = true;
  }, duration);
}

function bump(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function updateHeld() {
  const { hands, customers } = shift.state;
  heldText.textContent = hands.length ? hands.map(describeItem).join(" + ") : "Nothing";
  heldHint.textContent = `→ ${hintFor(hands.find((item) => item.stage !== "raw") ?? hands[0], customers, shift.state.oven)}`;
  renderRecipeProgress(recipeProgress, shift);
}

// ---- Shift events: sound, pops, and narration ------------------------------------

const BURST_FOR_ACTION = { flavor: "flour", frost: "cheer", top: "sprinkles", box: "info", cool: "healthy", trash: "flour" };

function onShiftEvent(event) {
  const at = (id) => scene.stationPosition(id);
  const title = (id) => stationById(id)?.title ?? id;
  coach.onEvent(event);
  switch (event.type) {
    case "actionDone": {
      const kind = BURST_FOR_ACTION[event.action.split(":")[0]];
      if (kind) scene.burst(event.station, kind);
      break;
    }
    case "customerArrived": {
      const { name, order, toGo } = event.customer;
      playSound("pop");
      announce(order
        ? `${name} wants ${describeCupcake(order)}${order.topping === "none" ? ", plain" : ""}${toGo ? ", to go" : ""}.`
        : `${name} says: surprise me!${toGo ? " To go." : ""}`);
      break;
    }
    case "served": {
      const spot = at("bakeryDoor");
      playSound("eating");
      scene.burst("bakeryDoor", "hearts");
      scene.addFloat(`+${event.coins}¢`, spot.x, spot.y - 22, "good", { size: 16 });
      scene.addFloat(`+${event.points.toLocaleString()} pts`, spot.x, spot.y + 2, "bad", { size: 11 });
      if (event.combo) scene.addFloat(`★ ${event.combo.name}!`, spot.x, spot.y - 46, "info", { size: 13, life: 1.8 });
      announce(`Served ${event.customer.name}! Plus ${event.coins} coins.${event.combo ? ` ${event.combo.name}!` : ""}`);
      break;
    }
    case "comboDiscovered":
      playSound("shine");
      scene.burst("bakeryDoor", "stars");
      showBanner(`★ New combo: ${event.combo.name}`, "combo", 1800);
      announce(`New secret combo discovered: ${event.combo.name}!`);
      break;
    case "chainReaction":
      playSound("levelUp");
      showBanner(`STREAK BONUS! ×${event.level}`, "chain", 1700);
      bump(chainMeter, "is-bump");
      STATIONS.forEach((station) => scene.pulse(station.id, "cheer"));
      celebrate();
      announce(`Streak bonus! Multiplier times ${event.level}. Everyone in line cheers up!`);
      break;
    case "chainBroken": {
      const spot = at("bakeryDoor");
      scene.addFloat("Streak broken!", spot.x, spot.y - 30, "bad");
      bump(chainMeter, "is-broken");
      announce(`Streak broken after ${event.chain} in a row.`);
      break;
    }
    case "chainSaved": {
      const spot = at("bakeryDoor");
      scene.addFloat("Streak saved!", spot.x, spot.y - 30, "good");
      announce("The Streak Saver kept your streak alive!");
      break;
    }
    case "customerLeft":
      playSound("aww");
      announce(`${event.customer.name} got tired of waiting and left.`);
      break;
    case "ovenIn":
      playSound("plop");
      break;
    case "ovenDone": {
      const spot = at("oven");
      playSound("bell");
      scene.addFloat("Ding!", spot.x, spot.y - 20, "good");
      announce("A cupcake is ready in the oven.");
      break;
    }
    case "burnt": {
      const spot = at("oven");
      playSound("pop");
      scene.addFloat("Burnt!", spot.x, spot.y - 20, "bad");
      announce("A cupcake burned in the oven!");
      break;
    }
    case "overheat": {
      const spot = at(event.station);
      playSound("pop");
      scene.pulse(event.station, "bad");
      scene.addFloat("OVERHEATED!", spot.x, spot.y - 20, "bad", { size: 15, life: 1.8 });
      showBanner(`${title(event.station)} overheated!`, "heat", 1600);
      announce(`${title(event.station)} overheated! The heat is spreading down the line.`);
      break;
    }
    case "jammed":
      if (event.station !== event.source) {
        const spot = at(event.station);
        scene.addFloat("Jammed!", spot.x, spot.y - 20, "bad");
        announce(`${title(event.station)} jammed from the heat wave.`);
      }
      break;
    case "heatWave":
      if (event.value >= 0.25 && event.station !== event.source) scene.pulse(event.station, "heatWave");
      break;
    case "recovered": {
      const spot = at(event.station);
      scene.addFloat("Back online", spot.x, spot.y - 20, "good");
      announce(`${title(event.station)} cooled down.`);
      break;
    }
    case "cooled":
      playSound("whoosh");
      break;
    case "busy": {
      const action = event.action;
      if (action.startsWith("flavor:") || action.startsWith("frost:")) playSound("mix");
      else if (action === "top:sprinkles") playSound("sprinkles");
      else if (action.startsWith("top:")) playSound("pop");
      else if (action === "box") playSound("box");
      else if (action === "trash") playSound("plop");
      break;
    }
    case "actionFailed": {
      const spot = scene.playerPosition();
      scene.addFloat("Too late!", spot.x, spot.y - 60, "bad");
      break;
    }
    case "openBook":
      openBook();
      break;
    case "shiftEnd":
      endShift(event.summary);
      break;
    default:
      break;
  }
}

function gameFrame(dt) {
  if (phase === "countdown") {
    countdown -= dt;
    const label = countdown > 0.35 ? String(Math.ceil(countdown - 0.35)) : "OPEN!";
    if (shiftBanner.textContent !== label) showBanner(label, "count", label === "OPEN!" ? 900 : 0);
    if (countdown <= 0) phase = "shift";
    return;
  }
  if (phase !== "shift" || !shift) return;
  if (document.querySelector("dialog[open]")) return;
  shift.tick(dt);
  if (!shift || phase !== "shift") return;
  coach.frame();
  hud.update({ shift, dayLabel: shiftLabel(), playerLabel: run.mode === "vs" ? run.name : "", goal: dayConfig(run).goal });
  renderOrders(orderRail, shift, shift.state.discovered);
  panel.refresh(shift);
  updateHeld();
}

// ---- Flow: menu -> day intro -> shift -> summary -> shop -> ... -------------------

function enterGameScreen() {
  shell.classList.add("is-playing");
  welcomePanel.classList.add("is-hidden");
}

function showMenu() {
  phase = "menu";
  coach.stop();
  shift = null;
  run = null;
  currentScreen = null;
  screens.close();
  shiftLayer.hidden = true;
  pauseButton.hidden = true;
  panel.hide();
  scene.removePlayer();
  shell.classList.remove("is-playing");
  welcomePanel.classList.remove("is-hidden");
  updateWelcomeBest();
  soloButton.focus();
}

function showScreen(name, options) {
  currentScreen = name;
  screens.show(options);
}

function startSolo() {
  vs = null;
  run = createRun({ mode: "solo", seed: randomSeed() });
  playSound("gameStart");
  enterGameScreen();
  showDayIntro();
}

function showDayIntro() {
  const config = dayConfig(run);
  const vsMode = run.mode === "vs";
  showScreen("intro", {
    kicker: vsMode ? `BAKE-OFF · ${run.name.toUpperCase()}` : `DAY ${run.day} OF ${totalDays(run)}`,
    title: vsMode ? `${run.name}'s shift` : DAY_TITLES[run.day - 1],
    html: dayIntroHtml(run, config) + upgradesOwnedHtml(run),
    buttons: [
      { label: "Open the bakery →", primary: true, onClick: startShift },
      ...(!vsMode && run.day === 1 ? [{ label: "Replay guided first order", onClick: () => { coach.resetTips(); startShift(); } }] : []),
      { label: "How to play", onClick: () => howToDialog.showModal() },
    ],
  });
  announce(vsMode ? `${run.name}'s Bake-Off shift. Press Open the bakery to start.` : `Day ${run.day}: ${DAY_TITLES[run.day - 1]}. Goal ${config.goal} coins.`);
}

function startShift() {
  screens.close();
  currentScreen = null;
  const config = dayConfig(run);
  shift = createShift({ day: config, seed: daySeed(run), menu: run.menu, upgrades: run.upgrades, discovered: run.discovered, onEvent: onShiftEvent });
  hud.reset();
  orderRail.dataset.signature = "";
  panel.hide();
  scene.resetPlayer();
  shiftLayer.hidden = false;
  pauseButton.hidden = false;
  hud.update({ shift, dayLabel: shiftLabel(), playerLabel: run.mode === "vs" ? run.name : "", goal: config.goal });
  renderOrders(orderRail, shift, shift.state.discovered);
  updateHeld();
  coach.start(shift, { withTutorial: run.mode === "solo" && run.day === 1 });
  countdown = coach.tutorialActive ? 0.9 : 3.3;
  phase = "countdown";
  playSound("gameStart");
  announce(`${shiftLabel()}. Get ready!`);
}

function endShift(summary) {
  phase = "screen";
  coach.stop();
  panel.hide();
  scene.stopWalking();
  pauseButton.hidden = true;
  playSound("confirm");
  showBanner("Closing time!", "closing", 1500);
  window.setTimeout(() => {
    const outcome = finishDay(run, summary);
    showSummary(summary, outcome);
  }, 1500);
}

function showSummary(summary, outcome) {
  const day = run.history.at(-1).day;
  let title;
  let buttons;
  if (run.mode === "vs") {
    title = `Nice shift, ${run.name}!`;
    buttons = [{
      label: vs.turn === 0 ? `Pass to ${vs.names[1]} →` : "See who won →",
      primary: true,
      onClick: () => {
        if (vs.turn === 0) {
          vs.turn = 1;
          beginVsTurn();
        } else {
          showVsResults();
        }
      },
    }];
  } else if (!outcome.goalMet) {
    title = "Short of the goal...";
    buttons = [{ label: "See final results", primary: true, onClick: showRunEnd }];
  } else if (run.won) {
    title = "All five days done!";
    buttons = [{ label: "See final results", primary: true, onClick: showRunEnd }];
  } else {
    title = ["Goal reached!", "Great day!", "Five-star day!"][outcome.stars - 1];
    buttons = [{ label: "Visit the shop →", primary: true, onClick: showShop }];
  }
  if (outcome.goalMet && run.mode === "solo") celebrate(true);
  showScreen("summary", {
    kicker: run.mode === "vs" ? `${run.name.toUpperCase()}'S RESULTS` : `DAY ${day} RESULTS`,
    title,
    html: summaryHtml(run, summary, outcome),
    buttons,
  });
  announce(`${title} You earned ${summary.coins} coins and ${summary.points} points.`);
}

function showShop() {
  showScreen("shop", {
    kicker: run.mode === "vs" ? `${run.name.toUpperCase()}'S BUDGET` : `SHOP · BEFORE DAY ${run.day}`,
    title: "Upgrade the bakery",
    html: shopHtml(run),
    wide: true,
    buttons: [{ label: run.mode === "vs" ? "Done shopping →" : `On to day ${run.day} →`, primary: true, onClick: showDayIntro }],
  });
}

gameDialogBody.addEventListener("click", (event) => {
  const item = event.target.closest("button[data-buy]");
  if (!item || currentScreen !== "shop") return;
  if (!buy(run, item.dataset.buy)) return;
  playSound("confirm");
  const id = item.dataset.buy;
  gameDialogBody.innerHTML = shopHtml(run);
  const again = gameDialogBody.querySelector(`[data-buy="${CSS.escape(id)}"]`);
  (again && !again.disabled ? again : $("#game-dialog-actions .start-button"))?.focus();
  announce(`Bought. ${run.coins} coins left.`);
});

function updateWelcomeBest() {
  const best = Number(store.get(HIGH_SCORE_KEY, 0)) || 0;
  welcomeBest.textContent = best ? `${best.toLocaleString()} points` : "No runs yet";
}

function showRunEnd() {
  const best = Number(store.get(HIGH_SCORE_KEY, 0)) || 0;
  const newRecord = run.score > best;
  if (newRecord) store.set(HIGH_SCORE_KEY, String(run.score));
  if (run.won || newRecord) celebrate(true);
  const title = run.won ? "Five-star bakery!" : `Closed on day ${run.history.at(-1).day}`;
  showScreen("runEnd", {
    kicker: run.won ? "YOU WON!" : "RUN OVER",
    title,
    html: runEndHtml(run, { newRecord, best: Math.max(best, run.score) }),
    buttons: [
      { label: "Play again", primary: true, onClick: startSolo },
      { label: "Main menu", onClick: showMenu },
    ],
    cancel: showMenu,
  });
  announce(`${title} Final score ${run.score}.${newRecord ? " New best score!" : ""}`);
}

// ---- Bake-Off (2 players, hot seat) --------------------------------------------------

function startVsSetup() {
  enterGameScreen();
  showScreen("vsSetup", {
    kicker: "BAKE-OFF",
    title: "Two bakers, one kitchen",
    html: vsSetupHtml(vs?.names ?? ["Baker 1", "Baker 2"]),
    buttons: [
      { label: "Start the Bake-Off →", primary: true, onClick: () => beginVs([0, 1].map((index) => $(`#vs-name-${index}`).value.trim() || `Baker ${index + 1}`)) },
      { label: "Back", onClick: showMenu },
    ],
    cancel: showMenu,
  });
}

gameDialogBody.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && currentScreen === "vsSetup" && event.target.matches("input")) {
    event.preventDefault();
    $("#game-dialog-actions .start-button")?.click();
  }
});

function beginVs(names) {
  const seed = randomSeed();
  vs = { names, seed, turn: 0, runs: names.map((name) => createRun({ mode: "vs", seed, name })) };
  playSound("gameStart");
  beginVsTurn();
}

function beginVsTurn() {
  run = vs.runs[vs.turn];
  const other = vs.names[1 - vs.turn];
  const previous = vs.turn === 1 ? `${escapeHtml(vs.names[0])} scored <strong>${vs.runs[0].score.toLocaleString()}</strong>. ` : "";
  showScreen("vsTurn", {
    kicker: "PASS THE KEYBOARD",
    title: `${run.name}, you're up!`,
    html: `<p class="lead">${previous}Spend your 150¢ on upgrades, then bake for 100 seconds. ${escapeHtml(other)}, no peeking!</p>`,
    buttons: [{ label: "Go shopping →", primary: true, onClick: showShop }],
  });
  announce(`${run.name}, you're up!`);
}

function showVsResults() {
  const [a, b] = vs.runs;
  const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
  const title = winner ? `${winner.name} wins!` : "It's a tie!";
  celebrate(true);
  showScreen("vsResults", {
    kicker: "BAKE-OFF RESULTS",
    title,
    html: vsResultsHtml(vs),
    wide: true,
    buttons: [
      { label: "Rematch", primary: true, onClick: () => beginVs(vs.names) },
      { label: "Main menu", onClick: showMenu },
    ],
    cancel: showMenu,
  });
  announce(`${title} ${a.name} ${a.score} points, ${b.name} ${b.score} points.`);
}

// ---- Pause, recipe book, quitting --------------------------------------------------------

function resume(resumePhase) {
  screens.close();
  currentScreen = null;
  phase = resumePhase;
}

function pause() {
  if (phase !== "shift" && phase !== "countdown") return;
  showPauseScreen(phase);
  phase = "paused";
}

function showPauseScreen(resumePhase) {
  showScreen("pause", {
    kicker: "PAUSED",
    title: "Take a breather",
    html: `<p class="lead">${run.mode === "vs" ? `Bake-Off · ${escapeHtml(run.name)}` : `Day ${run.day} of ${totalDays(run)} · goal ${dayConfig(run).goal}¢`}. The clock is stopped.</p>`,
    buttons: [
      { label: "Resume", primary: true, onClick: () => resume(resumePhase) },
      { label: "How to play", onClick: () => howToDialog.showModal() },
      { label: "Heat Lab", onClick: openLab },
      {
        label: "Show tips again",
        onClick: () => {
          coach.resetTips();
          announce("Tips will show again, and the tutorial will play on your next day 1.");
        },
      },
      {
        label: "Quit to menu",
        onClick: () => showScreen("quit", {
          kicker: "QUIT",
          title: "Leave this run?",
          html: '<p class="lead">Your progress in this run will be lost.</p>',
          buttons: [
            { label: "Keep baking", primary: true, onClick: () => showPauseScreen(resumePhase) },
            { label: "Quit to menu", onClick: showMenu },
          ],
          cancel: () => showPauseScreen(resumePhase),
        }),
      },
    ],
    cancel: () => resume(resumePhase),
  });
}

function openBook() {
  if (!shift || phase !== "shift") return;
  phase = "paused";
  playSound("whoosh");
  showScreen("book", {
    kicker: "RECIPE BOOK",
    title: "Secret combos",
    html: bookHtml(shift.state.discovered, run.menu),
    wide: true,
    buttons: [{ label: "Back to the kitchen", primary: true, onClick: () => resume("shift") }],
    cancel: () => resume("shift"),
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

pauseButton.addEventListener("click", pause);
soloButton.addEventListener("click", startSolo);
$("#vs-button").addEventListener("click", startVsSetup);
$("#how-to-button").addEventListener("click", () => howToDialog.showModal());
$("#how-to-lab").addEventListener("click", openLab);

const STATION_BY_KEY = Object.fromEntries(STATIONS.map((station) => [station.key, station.id]));
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (document.querySelector("dialog[open]") || event.target.closest?.("input, textarea")) return;
  if (phase !== "shift" && phase !== "countdown") return;
  const key = event.key.toLowerCase();
  if (key === "escape" || key === "p") {
    event.preventDefault();
    pause();
    return;
  }
  if (phase !== "shift") return;
  if (STATION_BY_KEY[key]) {
    event.preventDefault();
    playSound("click");
    scene.walkTo(STATION_BY_KEY[key]);
    return;
  }
  if (/^[1-9]$/.test(key)) {
    const actionId = panel.actionAt(Number(key) - 1, shift);
    if (actionId) {
      event.preventDefault();
      performAction(panel.stationId, actionId);
    }
  }
});

// Click sounds for every enabled button.
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("button");
  if (button && !button.disabled && !button.dataset.buy && !button.closest("#station-actions")) playSound("click");
}, true);

// Static dialogs close on their × button or a backdrop click.
for (const dialog of document.querySelectorAll("#how-to-dialog, #chain-lab-dialog")) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest(".dialog-close")) dialog.close();
  });
}

// ---- Heat Lab ------------------------------------------------------------------------------

const labDialog = $("#chain-lab-dialog");
const labStations = $("#chain-lab-stations");
const labLog = $("#chain-lab-log");
const labScore = $("#chain-lab-score");
const labHighScore = $("#chain-lab-highscore");
const labEndless = $("#chain-lab-endless");
const labGameOver = $("#chain-lab-gameover");
let chainLab = null;

function setLabBusy(busy) {
  labStations.querySelectorAll("button").forEach((button) => button.setAttribute("aria-disabled", String(busy)));
}

function ensureChainLab() {
  if (chainLab) return chainLab;
  chainLab = createChainReactionLab({
    canvas: $("#chain-lab-canvas"),
    onScoreChange: ({ score, highScore }) => {
      labScore.textContent = String(score);
      labHighScore.textContent = String(highScore);
      setLabBusy(false);
    },
    onLog: (message, { minor = false } = {}) => {
      labLog.textContent = message;
      if (minor) setLabBusy(true);
      if (!minor || !labEndless.checked) speak(message);
    },
    onGameOver: ({ score, highScore, round }) => {
      const message = `Kitchen meltdown after ${round} round${round === 1 ? "" : "s"}! Final score ${score}.`;
      labEndless.checked = false;
      labLog.textContent = message;
      $("#chain-lab-gameover-detail").textContent = `Final score ${score} · Best ${highScore} · ${round} round${round === 1 ? "" : "s"}`;
      labGameOver.hidden = false;
      $("#chain-lab-play-again").focus();
      speak(message);
    },
  });
  chainLab.setColorblindMode(paletteId === "colorblind");
  return chainLab;
}

function resetLab() {
  ensureChainLab().reset();
  labGameOver.hidden = true;
  labLog.textContent = "Click any station to begin.";
}

LAB_NODES.forEach((node) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.nodeId = node.id;
  button.textContent = node.label;
  button.setAttribute("aria-label", `Shock ${node.label}`);
  labStations.append(button);
});
labStations.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-node-id]");
  if (!button || !labGameOver.hidden) return;
  if (!ensureChainLab().triggerShock(button.dataset.nodeId)) labLog.textContent = "Cascade still running - wait for it to settle.";
});
["focusin", "pointerover"].forEach((type) => labStations.addEventListener(type, (event) => {
  const button = event.target.closest("button[data-node-id]");
  if (button) ensureChainLab().setHighlight(button.dataset.nodeId);
}));
["focusout", "pointerleave"].forEach((type) => labStations.addEventListener(type, () => chainLab?.setHighlight(null)));

function openLab() {
  const state = ensureChainLab().getState();
  labScore.textContent = String(state.score);
  labHighScore.textContent = String(state.highScore);
  labEndless.checked = state.endlessMode;
  labDialog.showModal();
  labStations.querySelector("button")?.focus();
  speak("Heat Lab. Shock a station to see how heat spreads.");
}

labDialog.addEventListener("close", () => {
  chainLab?.setEndlessMode(false);
  labEndless.checked = false;
  chainLab?.setHighlight(null);
});
labEndless.addEventListener("change", () => {
  ensureChainLab().setEndlessMode(labEndless.checked);
  if (labEndless.checked && !chainLab.getState().running) labLog.textContent = "Endless mode on - shock any station to start the run.";
});
$("#chain-lab-reset").addEventListener("click", () => {
  resetLab();
  labEndless.checked = false;
});
$("#chain-lab-play-again").addEventListener("click", () => {
  resetLab();
  labStations.querySelector("button")?.focus();
});

// ---- Flourishes: confetti and the sprinkle cursor ---------------------------------------------

function celebrate(big = false) {
  if (REDUCED_MOTION.matches) return;
  const openDialogs = document.querySelectorAll("dialog[open]");
  const host = openDialogs[openDialogs.length - 1] ?? shell;
  let layer = host.querySelector(":scope > .confetti-layer");
  if (!layer) {
    layer = host === shell ? confettiLayer : document.createElement("div");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    if (host !== shell) host.append(layer);
  }
  const colors = [...PALETTES[paletteId].sprinkles, "#fff8e8"];
  const pieces = big ? 70 : 24;
  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--confetti-x", `${Math.random() * 100}%`);
    piece.style.setProperty("--confetti-delay", `${Math.random() * (big ? 600 : 150)}ms`);
    piece.style.setProperty("--confetti-fall", big ? "calc(100vh + 50px)" : "360px");
    piece.style.setProperty("--confetti-drift", `${Math.round(Math.random() * 120 - 60)}px`);
    piece.style.setProperty("--confetti-rotation", `${Math.round(Math.random() * 180)}deg`);
    piece.style.backgroundColor = colors[index % colors.length];
    layer.append(piece);
    window.setTimeout(() => piece.remove(), 3600);
  }
}

if (FINE_POINTER.matches) {
  const cursor = $("#custom-pixel-cursor");
  const sprinkleLayer = $("#cursor-sprinkle-layer");
  const sprinkleColors = () => PALETTES[paletteId].sprinkles;
  let lastSprinkle = 0;
  let sprinkleCount = 0;
  document.body.classList.add("has-custom-cursor");
  window.addEventListener("pointermove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.classList.add("is-visible");
    if (REDUCED_MOTION.matches || performance.now() - lastSprinkle < 32 || sprinkleCount >= 70) return;
    lastSprinkle = performance.now();
    const sprinkle = document.createElement("span");
    const openDialogs = document.querySelectorAll("dialog[open]");
    const life = 1400 + Math.random() * 700;
    sprinkle.className = "cursor-sprinkle";
    sprinkle.style.left = `${event.clientX + 7 + Math.random() * 5}px`;
    sprinkle.style.top = `${event.clientY + 12 + Math.random() * 5}px`;
    sprinkle.style.setProperty("--sprinkle-color", sprinkleColors()[Math.floor(Math.random() * sprinkleColors().length)]);
    sprinkle.style.setProperty("--sprinkle-rotation", `${Math.round(Math.random() * 180)}deg`);
    sprinkle.style.setProperty("--sprinkle-drift", `${Math.round(Math.random() * 64 - 32)}px`);
    sprinkle.style.setProperty("--sprinkle-fall", `${Math.round(105 + Math.random() * 90)}px`);
    sprinkle.style.setProperty("--sprinkle-life", `${Math.round(life)}ms`);
    (openDialogs[openDialogs.length - 1] ?? sprinkleLayer).append(sprinkle);
    sprinkleCount += 1;
    const remove = () => {
      if (!sprinkle.isConnected) return;
      sprinkle.remove();
      sprinkleCount -= 1;
    };
    sprinkle.addEventListener("animationend", remove, { once: true });
    window.setTimeout(remove, life + 150);
  });
  document.documentElement.addEventListener("mouseleave", () => cursor.classList.remove("is-visible"));
}

// ---- Boot ------------------------------------------------------------------------------------------

setupAudio({ music: $("#background-music"), controls: $(".sound-controls"), toggle: $("#sound-toggle"), down: $("#volume-down"), up: $("#volume-up") });
setupCharacterDialog({
  dialog: $("#character-dialog"),
  openButtons: [$("#customize-button")],
  closeButton: $("#character-close"),
  options: $("#character-options"),
  preview: $("#avatar-preview"),
  nameInput: $("#character-name"),
  defaultButton: $("#default-character"),
  saveButton: $("#save-character"),
  playSound,
});
applyTextSize();
applyPalette();
updateWelcomeBest();
