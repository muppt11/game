// Chain Reaction Lab
//
// A small discrete-event graph simulation, styled after DebtRank
// (Battiston et al.), the algorithm used to measure how distress at one node
// of a financial network propagates to its neighbors. Here the "network" is
// Tanvi's own bakery pipeline: Ingredients -> Batter -> Assembly -> Oven ->
// Frosting -> Decorating -> Packaging -> Serving, plus two extra dependency
// edges (Oven -> Packaging, Ingredients -> Assembly) so it is a real DAG.
//
// Trigger a shock at one station and watch it cascade: each hop's impact is
// scaled by the edge weight and a global decay factor (both < 1), so the
// distress delivered strictly shrinks hop over hop and eventually drops
// below MIN_PROPAGATE. That is what guarantees the simulation terminates;
// MAX_EVENTS is only a hard safety cap.

export const CRITICAL_THRESHOLD = 0.6;
export const WARNING_THRESHOLD = 0.25;
const EPSILON = 0.02;
const MIN_PROPAGATE = 0.03;
const MAX_EVENTS = 2000;
export const BASE_GLOBAL_DECAY = 0.82;
export const MAX_GLOBAL_DECAY = 0.95;
const DECAY_STEP_PER_ROUND = 0.015;
const COLLAPSE_THRESHOLD = 0.8;
const ROUND_RECOVERY = 0.35;
const ENDLESS_ROUND_DELAY = 1400;
const HIGH_SCORE_KEY = "tanvis-chain-reaction-highscore";

const CANVAS_WIDTH = 580;
const CANVAS_HEIGHT = 280;
const NODE_RADIUS = 26;

// Laid out as a "snake" so the pipeline reads left-to-right along the top
// row, drops down at the Oven, and runs right-to-left along the bottom.
export const NODES = [
  { id: "ingredients", label: "Ingredients", x: 75, y: 80 },
  { id: "batter", label: "Batter", x: 218, y: 80 },
  { id: "assembly", label: "Assembly", x: 362, y: 80 },
  { id: "oven", label: "Oven", x: 505, y: 80 },
  { id: "frosting", label: "Frosting", x: 505, y: 215 },
  { id: "decorating", label: "Decorating", x: 362, y: 215 },
  { id: "packaging", label: "Packaging", x: 218, y: 215 },
  { id: "serving", label: "Serving", x: 75, y: 215 },
];

export const EDGES = [
  { from: "ingredients", to: "batter", weight: 0.9, delay: 260 },
  { from: "batter", to: "assembly", weight: 0.85, delay: 260 },
  { from: "assembly", to: "oven", weight: 0.9, delay: 300 },
  { from: "oven", to: "frosting", weight: 0.75, delay: 260 },
  { from: "oven", to: "packaging", weight: 0.55, delay: 420 },
  { from: "frosting", to: "decorating", weight: 0.85, delay: 260 },
  { from: "decorating", to: "packaging", weight: 0.85, delay: 260 },
  { from: "packaging", to: "serving", weight: 0.9, delay: 260 },
  // Weak shortcut edge, drawn as an arc over Batter so it doesn't hide behind it.
  { from: "ingredients", to: "assembly", weight: 0.35, delay: 500, arc: -80 },
];

// Every palette keeps a symbol-legible text color per status, so the ✓ / ! / ✕
// glyph always has enough contrast against its fill.
const PALETTES = {
  normal: {
    healthy: "#8fbf6f",
    warning: "#f0c96b",
    critical: "#ad4d4b",
    symbol: { healthy: "#3b2520", warning: "#3b2520", critical: "#fff8e8" },
    edge: "#6f4436",
    label: "#3b2520",
  },
  // Okabe-Ito blue / orange / black.
  colorblindSafe: {
    healthy: "#0072B2",
    warning: "#E69F00",
    critical: "#000000",
    symbol: { healthy: "#ffffff", warning: "#000000", critical: "#ffffff" },
    edge: "#3d2929",
    label: "#3b2520",
  },
};

const STATUS_SYMBOL = { healthy: "✓", warning: "!", critical: "✕" };

// Binary min-heap keyed by event time. Each schedule/pop is O(log n) instead
// of re-sorting the whole event list on every push.
export class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].time <= items[index].time) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }
  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = index * 2 + 2;
        let smallest = index;
        if (left < items.length && items[left].time < items[smallest].time) smallest = left;
        if (right < items.length && items[right].time < items[smallest].time) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * Runs the cascade for a single shock and returns every distress update in
 * the order it happened, with its simulated timestamp and hop depth.
 *
 * Properties (covered in chainReaction.test.js):
 *  - distress is monotonically non-decreasing per node,
 *  - propagated impact strictly shrinks each hop (weight * decay < 1),
 *  - so the heap always drains, for every trigger node.
 */
export function simulateCascade(triggerId, { decay = BASE_GLOBAL_DECAY, startDistress = {} } = {}) {
  const adjacency = new Map(NODES.map((node) => [node.id, []]));
  for (const edge of EDGES) adjacency.get(edge.from)?.push(edge);

  const distress = {};
  for (const node of NODES) distress[node.id] = startDistress[node.id] ?? 0;

  const heap = new MinHeap();
  heap.push({ time: 0, node: triggerId, incoming: 1 - distress[triggerId], depth: 0 });

  const events = [];
  const criticalOrder = [];
  let guard = 0;

  while (heap.size > 0 && guard < MAX_EVENTS) {
    guard += 1;
    const { time, node, incoming, depth } = heap.pop();
    const before = distress[node];
    const after = Math.min(1, before + Math.max(0, incoming));
    const delta = after - before;
    if (delta <= EPSILON) continue;

    distress[node] = after;
    events.push({ time, node, distress: after, delta, depth });

    // Only count a node the moment it crosses into critical, so re-shocking an
    // already-critical station can't farm points.
    if (before < CRITICAL_THRESHOLD && after >= CRITICAL_THRESHOLD) {
      criticalOrder.push({ node, time, depth });
    }

    for (const edge of adjacency.get(node) ?? []) {
      const nextIncoming = delta * edge.weight * decay;
      if (nextIncoming > MIN_PROPAGATE) {
        heap.push({ time: time + edge.delay, node: edge.to, incoming: nextIncoming, depth: depth + 1 });
      }
    }
  }

  return { events, distress, criticalOrder, terminated: heap.size === 0 };
}

/**
 * 100 points per station that goes critical, times (1 + hop depth) so deeper
 * links in the chain are worth more, plus a big-cascade bonus for 4+ stations.
 */
export function scoreCascade(criticalOrder) {
  let points = 0;
  let maxDepth = 0;
  for (const { depth } of criticalOrder) {
    points += 100 * (1 + depth);
    maxDepth = Math.max(maxDepth, depth);
  }
  const bonus = criticalOrder.length >= 4 ? criticalOrder.length * criticalOrder.length * 25 : 0;
  return { points: points + bonus, bonus, maxDepth };
}

export function statusFor(distressValue) {
  if (distressValue >= CRITICAL_THRESHOLD) return "critical";
  if (distressValue >= WARNING_THRESHOLD) return "warning";
  return "healthy";
}

function readHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // Storage unavailable (private mode, blocked site data) - keep it in memory only.
  }
}

const nodeById = (id) => NODES.find((node) => node.id === id);

export function createChainReactionLab({ canvas, onScoreChange, onLog, onGameOver }) {
  const ctx = canvas.getContext("2d");
  const distress = {};
  for (const node of NODES) distress[node.id] = 0;

  let colorblindMode = false;
  let endlessMode = false;
  let score = 0;
  let highScore = readHighScore();
  let round = 0;
  let running = false;
  let pendingEvents = [];
  let animationStart = 0;
  let rafHandle = null;
  let endlessTimer = null;
  let recentlyTriggered = [];
  let highlightedId = null;
  const pulses = new Map();

  // Render at device pixel ratio so text and node outlines stay crisp on
  // retina screens; all drawing uses the 580x280 logical coordinates.
  function sizeCanvas() {
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = CANVAS_WIDTH * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function palette() {
    return colorblindMode ? PALETTES.colorblindSafe : PALETTES.normal;
  }

  function drawArrowHead(x, y, angle, color) {
    const size = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45));
    ctx.lineTo(x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function drawEdge(edge, colors) {
    const from = nodeById(edge.from);
    const to = nodeById(edge.to);
    ctx.globalAlpha = 0.4 + edge.weight * 0.5;
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1.5 + edge.weight * 2.5;
    ctx.setLineDash(edge.weight < 0.5 ? [6, 5] : []);

    let angle;
    let tipX;
    let tipY;
    ctx.beginPath();
    if (edge.arc) {
      const cx = (from.x + to.x) / 2;
      const cy = (from.y + to.y) / 2 + edge.arc;
      const startAngle = Math.atan2(cy - from.y, cx - from.x);
      angle = Math.atan2(to.y - cy, to.x - cx);
      tipX = to.x - Math.cos(angle) * (NODE_RADIUS + 2);
      tipY = to.y - Math.sin(angle) * (NODE_RADIUS + 2);
      ctx.moveTo(from.x + Math.cos(startAngle) * NODE_RADIUS, from.y + Math.sin(startAngle) * NODE_RADIUS);
      ctx.quadraticCurveTo(cx, cy, tipX, tipY);
    } else {
      angle = Math.atan2(to.y - from.y, to.x - from.x);
      tipX = to.x - Math.cos(angle) * (NODE_RADIUS + 2);
      tipY = to.y - Math.sin(angle) * (NODE_RADIUS + 2);
      ctx.moveTo(from.x + Math.cos(angle) * NODE_RADIUS, from.y + Math.sin(angle) * NODE_RADIUS);
      ctx.lineTo(tipX, tipY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(tipX, tipY, angle, colors.edge);
    ctx.globalAlpha = 1;
  }

  function draw(now = performance.now()) {
    const colors = palette();
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const edge of EDGES) drawEdge(edge, colors);

    for (const node of NODES) {
      const status = statusFor(distress[node.id] ?? 0);

      // Short ring that expands when a node takes a hit during the cascade.
      const pulseStart = pulses.get(node.id);
      if (pulseStart !== undefined) {
        const t = (now - pulseStart) / 450;
        if (t >= 1) {
          pulses.delete(node.id);
        } else {
          ctx.beginPath();
          ctx.strokeStyle = colors[status];
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 4;
          ctx.arc(node.x, node.y, NODE_RADIUS + 4 + t * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      if (node.id === highlightedId) {
        ctx.beginPath();
        ctx.strokeStyle = "#f2cf83";
        ctx.lineWidth = 4;
        ctx.arc(node.x, node.y, NODE_RADIUS + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.fillStyle = colors[status];
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.edge;
      ctx.stroke();

      ctx.fillStyle = colors.symbol[status];
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(STATUS_SYMBOL[status], node.x, node.y + 1);

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = colors.label;
      ctx.fillText(node.label, node.x, node.y + NODE_RADIUS + 15);
    }
  }

  function stopAnimation() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }

  function clearEndlessTimer() {
    if (endlessTimer) window.clearTimeout(endlessTimer);
    endlessTimer = null;
  }

  function averageDistress() {
    const values = NODES.map((node) => distress[node.id] ?? 0);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function finishRound(criticalOrder) {
    running = false;
    const { points, bonus, maxDepth } = scoreCascade(criticalOrder);
    score += points;
    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
    }
    onScoreChange?.({ score, highScore, chainDepth: maxDepth });
    const count = criticalOrder.length;
    const reach = maxDepth > 0 ? `, ${maxDepth} hop${maxDepth === 1 ? "" : "s"} deep` : "";
    onLog?.(
      count > 0
        ? `Chain reaction! ${count} station${count === 1 ? "" : "s"} critical${reach}: +${points}${bonus ? ` (big cascade bonus +${bonus})` : ""}.`
        : "Shock absorbed - no chain reaction this time.",
    );

    if (!endlessMode) return;
    if (averageDistress() >= COLLAPSE_THRESHOLD) {
      endlessMode = false;
      onGameOver?.({ score, highScore, round });
      return;
    }
    endlessTimer = window.setTimeout(() => {
      endlessTimer = null;
      // Partial recovery between rounds, but the network gets a little more
      // fragile (less decay resistance) each round, so an endless run keeps
      // escalating until it collapses.
      for (const node of NODES) distress[node.id] *= ROUND_RECOVERY;
      const nextDecay = Math.min(MAX_GLOBAL_DECAY, BASE_GLOBAL_DECAY + round * DECAY_STEP_PER_ROUND);
      const available = NODES.filter((node) => !recentlyTriggered.includes(node.id));
      const pool = available.length ? available : NODES;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      triggerShock(pick.id, nextDecay);
    }, ENDLESS_ROUND_DELAY);
  }

  function animate(events, criticalOrder) {
    stopAnimation();
    animationStart = performance.now();
    pendingEvents = [...events];

    function step(now) {
      const elapsed = now - animationStart;
      while (pendingEvents.length && pendingEvents[0].time <= elapsed) {
        const event = pendingEvents.shift();
        distress[event.node] = event.distress;
        pulses.set(event.node, now);
      }
      draw(now);
      if (pendingEvents.length > 0 || pulses.size > 0) {
        rafHandle = requestAnimationFrame(step);
      } else {
        rafHandle = null;
        finishRound(criticalOrder);
      }
    }
    rafHandle = requestAnimationFrame(step);
  }

  // The single entry point for a shock: canvas clicks, the station buttons and
  // endless mode all go through here. Returns false if a cascade is running.
  function triggerShock(nodeId, decay = BASE_GLOBAL_DECAY) {
    const node = nodeById(nodeId);
    if (running || !node) return false;
    clearEndlessTimer();
    running = true;
    round += 1;
    recentlyTriggered = [nodeId, ...recentlyTriggered].slice(0, 3);
    const result = simulateCascade(nodeId, { decay, startDistress: { ...distress } });
    onLog?.(`Round ${round}: shock at ${node.label}.`, { minor: true });
    animate(result.events, result.criticalOrder);
    return true;
  }

  function nodeAtEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width;
    const y = ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height;
    return NODES.find((node) => Math.hypot(node.x - x, node.y - y) <= NODE_RADIUS + 4);
  }

  function handleClick(event) {
    const hit = nodeAtEvent(event);
    if (hit) triggerShock(hit.id);
  }

  function handleMove(event) {
    canvas.style.cursor = nodeAtEvent(event) ? "pointer" : "default";
  }

  canvas.addEventListener("click", handleClick);
  canvas.addEventListener("pointermove", handleMove);
  sizeCanvas();
  draw();

  return {
    triggerShock: (nodeId) => triggerShock(nodeId),
    setColorblindMode(value) {
      colorblindMode = value;
      draw();
    },
    setEndlessMode(value) {
      endlessMode = value;
      if (!value) clearEndlessTimer();
    },
    setHighlight(nodeId) {
      highlightedId = nodeId;
      if (!running) draw();
    },
    reset() {
      clearEndlessTimer();
      stopAnimation();
      pulses.clear();
      running = false;
      score = 0;
      round = 0;
      recentlyTriggered = [];
      for (const node of NODES) distress[node.id] = 0;
      draw();
      onScoreChange?.({ score, highScore, chainDepth: 0 });
    },
    getState() {
      return { score, highScore, round, running, colorblindMode, endlessMode };
    },
    destroy() {
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("pointermove", handleMove);
      clearEndlessTimer();
      stopAnimation();
    },
  };
}
