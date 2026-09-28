// Pop-up coaching during play: a guided first order on day 1, then one-time
// tips the first time something new happens (to-go orders, heat, chains...).
// Each tip points at a station with a speech bubble and an arrow on the canvas.

import { FLAVORS, FROSTINGS, TOPPINGS, stationById } from "./data.js";
import { isFinished, matchesOrder } from "./shift.js";

const TUTORIAL_KEY = "crb-tutorial-done";
const SEEN_KEY = "crb-tips-seen";
const TIP_SECONDS = 9;

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Tips just reappear next visit.
    }
  },
};

const orderText = (order) => {
  if (!order) return "anything frosted";
  const topping = order.topping === "none" ? "no topping" : TOPPINGS[order.topping].name.toLowerCase();
  return `${FLAVORS[order.flavor].name.toLowerCase()} cake, ${FROSTINGS[order.frosting].name.toLowerCase()} frosting, ${topping}`;
};

// One-time tips, keyed by id: what triggers them and what they say.
const TIPS = {
  togo: { title: "🎁 To-go order", station: "deliveryStation", text: "Someone wants their cupcake to go. Box it at Packaging before you serve it." },
  surprise: { title: "Surprise me!", station: "bakeryDoor", text: "This customer takes any frosted cupcake - and pays extra. Try a secret combo for big points." },
  combo: { title: "★ Secret combo", station: "recipeBook", text: "That ticket is a secret combo, worth way more. Every combo you find is saved in the Recipe Book." },
  ovenReady: { title: "Ding!", station: "oven", text: "A cupcake is ready. Grab it soon - cupcakes burn if you leave them in the oven." },
  heat: { title: "Heat is building", station: null, text: "Stations heat up as you use them - watch the bar and the ✓ / ! / ✕ badge. If one overheats, it jams." },
  overheat: { title: "Overheated!", station: null, text: "The heat is spreading to the stations down the line. Walk over and click Cool it down before it jams everything." },
  chainReaction: { title: "Streak bonus!", station: "bakeryDoor", text: "Every 3 serves in a row raises your score multiplier and cheers up everyone in line. Keep the streak going!" },
  lost: { title: "Streak broken", station: "bakeryDoor", text: "A customer got tired of waiting and left, which breaks your streak. Watch the patience bars on the tickets." },
  display: { title: "Display Case", station: "displayCase", text: "Too many orders? Park a finished cupcake in the Display Case and grab it later." },
};

export function createCoach({ bubble, kicker, text, okButton, skipButton, scene, announce }) {
  let seen = new Set();
  try {
    seen = new Set(JSON.parse(storage.get(SEEN_KEY) ?? "[]"));
  } catch {
    seen = new Set();
  }
  let shift = null;
  let tutorial = false;
  let current = null; // { id, title, text, station, tutorial, until }
  const queue = [];

  function markSeen(id) {
    seen.add(id);
    storage.set(SEEN_KEY, JSON.stringify([...seen]));
  }

  function place(stationId) {
    const station = stationId ? stationById(stationId) : null;
    if (!station) {
      bubble.style.left = "50%";
      bubble.style.top = "300px";
      bubble.dataset.side = "center";
      return;
    }
    // Sit beside the station on its upstream side (cupcakes flow left to right
    // along the top row, right to left along the bottom), so the stations the
    // cupcake - or the heat - is heading to next stay visible.
    const topRow = station.y < 300;
    const toRight = topRow ? station.x < 200 : station.x < 700;
    const x = Math.min(Math.max(toRight ? station.x + 158 : station.x - 158 - 250, 8), 702);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${station.y - 62}px`;
    bubble.dataset.side = toRight ? "right" : "left";
  }

  function render() {
    if (!current) {
      bubble.hidden = true;
      scene.setGuide(null);
      return;
    }
    kicker.textContent = current.title;
    if (text.textContent !== current.text) {
      text.textContent = current.text;
      announce(`${current.title}. ${current.text}`);
    }
    skipButton.hidden = !current.tutorial;
    okButton.hidden = Boolean(current.tutorial);
    place(current.station);
    bubble.hidden = false;
    scene.setGuide(current.station);
  }

  function show(tip) {
    current = tip;
    render();
  }

  // Urgent tips (something just went wrong) jump the queue and show now.
  function queueTip(id, overrides = {}, { urgent = false } = {}) {
    if (seen.has(id) || tutorial) return;
    if (current?.id === id || queue.some((tip) => tip.id === id)) return;
    markSeen(id);
    const tip = { id, ...TIPS[id], ...overrides };
    if (urgent) {
      if (current && !current.tutorial) queue.unshift({ ...current, until: undefined });
      show(tip);
    } else {
      queue.push(tip);
    }
  }

  function endTutorial({ skipped = false } = {}) {
    tutorial = false;
    storage.set(TUTORIAL_KEY, "1");
    shift?.setHold(false);
    current = null;
    if (!skipped) {
      show({ id: "tutorialDone", title: "Nice work!", text: "That's a whole cupcake! The clock is running now - serve 3 in a row for a streak bonus.", station: null, until: shift.state.time + 7 });
    } else {
      render();
    }
  }

  // The guided first order: the next step is worked out from what the player
  // is holding, so it never gets out of sync if they do things out of order.
  function tutorialStep() {
    const { state } = shift;
    const customer = state.customers[0];
    const at = scene.atStation;
    if (!customer) return { title: "Your first order", text: "A customer is on the way...", station: null };
    const order = customer.order;
    const who = customer.name;
    const held = state.hands.find((item) => item.stage !== "raw") ?? state.hands[0];

    if (held && held.stage === "burnt") return { title: "Oops, it burned", text: "Click Ingredients and toss the burnt cupcake, then start again.", station: "cafeTable" };
    if (held && isFinished(held)) {
      const topping = order?.topping ?? "none";
      if (topping !== "none" && !held.topping) {
        return at === "decoratingCounter"
          ? { title: "Step 5: Topping", text: `Click ${TOPPINGS[topping].name} in the menu.`, station: "decoratingCounter" }
          : { title: "Step 5: Topping", text: `${who} wants ${TOPPINGS[topping].name.toLowerCase()}. Click the Toppings station.`, station: "decoratingCounter" };
      }
      if (customer.toGo && !held.boxed) return { title: "Step 6: Box it", text: "It's a to-go order - click Packaging and box it.", station: "deliveryStation" };
      if (matchesOrder(held, customer)) {
        return at === "bakeryDoor"
          ? { title: "Last step: Serve!", text: `Click "Serve ${who}".`, station: "bakeryDoor" }
          : { title: "Last step: Serve!", text: `It's ready! Click the Serving station to hand it to ${who}.`, station: "bakeryDoor" };
      }
      return { title: "Hmm, not quite", text: `That's not what ${who} ordered (${orderText(order)}). Click Ingredients to toss it and try again.`, station: "cafeTable" };
    }
    if (held && held.stage === "baked") {
      const frosting = order ? FROSTINGS[order.frosting].name : "any frosting";
      return at === "frostingCounter"
        ? { title: "Step 4: Frost", text: `Click ${frosting} in the menu.`, station: "frostingCounter" }
        : { title: "Step 4: Frost", text: `${who} wants ${frosting.toLowerCase()}. Click the Frosting station.`, station: "frostingCounter" };
    }
    const ovenReady = state.oven.some((slot) => slot?.item.stage === "baked");
    if (ovenReady && state.hands.length < state.handCapacity) {
      return at === "oven"
        ? { title: "Ding! Step 3", text: 'Click "Take out the baked cupcake" - before it burns!', station: "oven" }
        : { title: "Ding! Step 3", text: "The cupcake is baked. Click the Oven to take it out before it burns!", station: "oven" };
    }
    if (held && held.stage === "raw") {
      return at === "oven"
        ? { title: "Step 2: Bake", text: 'Click "Bake". (Turbo bake is faster, but it heats up the oven.)', station: "oven" }
        : { title: "Step 2: Bake", text: "Now click the Oven to bake it.", station: "oven" };
    }
    if (state.oven.some((slot) => slot?.item.stage === "baking")) {
      return { title: "Baking...", text: "Watch the bar on the oven fill up. While you wait, look at the order tickets at the top.", station: "oven" };
    }
    const flavor = order ? FLAVORS[order.flavor].name : "any";
    return at === "cafeTable"
      ? { title: "Step 1: Batter", text: `Click "${flavor} batter" in the menu.`, station: "cafeTable" }
      : { title: "Your first order!", text: `${who}'s ticket is up top: ${orderText(order)}. Click the Ingredients station to start.`, station: "cafeTable" };
  }

  okButton.addEventListener("click", () => {
    current = null;
    render();
  });
  skipButton.addEventListener("click", () => endTutorial({ skipped: true }));

  return {
    start(nextShift, { withTutorial }) {
      shift = nextShift;
      queue.length = 0;
      current = null;
      tutorial = withTutorial && storage.get(TUTORIAL_KEY) !== "1";
      shift.setHold(false);
      render();
    },
    stop() {
      shift = null;
      tutorial = false;
      current = null;
      queue.length = 0;
      render();
    },
    resetTips() {
      seen = new Set();
      storage.set(SEEN_KEY, "[]");
      storage.set(TUTORIAL_KEY, "");
    },
    get tutorialActive() {
      return tutorial;
    },
    onEvent(event) {
      if (!shift) return;
      if (tutorial) {
        if (event.type === "served") endTutorial();
        return;
      }
      const customer = event.customer;
      if (event.type === "customerArrived") {
        if (customer.toGo) queueTip("togo");
        else if (!customer.order) queueTip("surprise");
        else if (customer.comboId) queueTip("combo");
        if (shift.state.customers.length >= 4) queueTip("display");
      }
      if (event.type === "ovenDone") queueTip("ovenReady");
      if (event.type === "overheat") {
        markSeen("heat");
        queueTip("overheat", { station: event.station }, { urgent: true });
      }
      if (event.type === "chainReaction") queueTip("chainReaction");
      if (event.type === "customerLeft") queueTip("lost", {}, { urgent: true });
    },
    frame() {
      if (!shift) return;
      if (tutorial) {
        // Freeze the clock and patience once the first customer is inside.
        if (!shift.state.hold && shift.state.customers.length > 0) shift.setHold(true);
        const step = tutorialStep();
        if (!current || current.title !== step.title || current.text !== step.text || current.station !== step.station) {
          show({ id: "tutorial", tutorial: true, ...step });
        }
        return;
      }
      const warm = Object.entries(shift.state.heat).find(([, heat]) => heat >= 0.25);
      if (warm) queueTip("heat", { station: warm[0] });
      if (current && current.until === undefined) current.until = shift.state.time + TIP_SECONDS;
      if (current && shift.state.time >= current.until) {
        current = null;
        render();
      }
      if (!current && queue.length) show(queue.shift());
    },
  };
}
