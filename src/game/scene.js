// The bakery kitchen on the Kaboom canvas: station artwork, the baker, and
// every live overlay (heat badges, oven timers, held cupcakes, score pops).
// Text is drawn each frame so it always follows the font size setting.

import { k } from "../kaboomCtx";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../constants";
import { clamp } from "../utils";
import { CRITICAL_THRESHOLD, WARNING_THRESHOLD } from "../chainReaction";
import { FLAVORS, FROSTINGS, RULES, STATIONS, TOPPINGS } from "./data";

const STATION_POS = Object.fromEntries(STATIONS.map((station) => [station.id, k.vec2(station.x, station.y)]));
const STATION_COLORS = {
  cafeTable: ["sage", "#dce5d1"],
  oven: ["red", "#f7dfce"],
  frostingCounter: ["red", "#f8dfe2"],
  decoratingCounter: ["golden", "#f7dfce"],
  recipeBook: ["golden", "#fff4e2"],
  displayCase: ["golden", "#f8dfe2"],
  bakeryDoor: ["sage", "#f7dfce"],
  deliveryStation: ["red", "#fff4e2"],
};
const ROOM_HALF_WIDTH = 87;
const ROOM_HALF_HEIGHT = 63;
const HOVER_CAPABLE = window.matchMedia("(hover: hover)");
const gameCanvas = document.querySelector("#game-canvas");
const stationIconGroups = new Map();

const colorCache = new Map();
const hex = (value) => {
  if (!colorCache.has(value)) colorCache.set(value, k.Color.fromHex(value));
  return colorCache.get(value);
};

// Every signal color in the kitchen. The colorblind set uses the Okabe-Ito
// palette (blue / orange / vermillion / black), and every signal also has a
// symbol or text, so color is never the only cue.
export const PALETTES = {
  standard: {
    id: "standard",
    healthy: "#87966f", warning: "#f0c96b", critical: "#ad4d4b",
    symbol: { healthy: "#fff8e8", warning: "#3b2520", critical: "#fff8e8" },
    good: "#2f6b35", bad: "#ad4d4b", info: "#9a6a00", heatWave: "#e98f5d", cheer: "#87966f",
    bake: "#f0c96b", turbo: "#e98f5d", ready: "#87966f", burning: "#ad4d4b", burnt: "#2b1b1b",
    hover: "#f0c96b",
    titles: { sage: COLORS.sage, red: COLORS.red, golden: COLORS.golden },
    sprinkles: ["#e98f9d", "#7695a8", "#f0c96b", "#87966f", "#bd5656"],
  },
  colorblind: {
    id: "colorblind",
    healthy: "#0072B2", warning: "#E69F00", critical: "#000000",
    symbol: { healthy: "#ffffff", warning: "#000000", critical: "#ffffff" },
    good: "#0072B2", bad: "#D55E00", info: "#7a5a00", heatWave: "#E69F00", cheer: "#56B4E9",
    bake: "#56B4E9", turbo: "#E69F00", ready: "#0072B2", burning: "#D55E00", burnt: "#000000",
    hover: "#56B4E9",
    titles: { sage: "#56B4E9", red: "#D55E00", golden: "#F0E442" },
    sprinkles: ["#CC79A7", "#0072B2", "#F0E442", "#009E73", "#D55E00"],
  },
};
export const itemColor = (entry, palette) => (palette.id === "colorblind" ? entry?.cbColor : null) ?? entry?.color;
const HEAT_SYMBOL = { healthy: "COOL", warning: "HOT", critical: "JAM" };

export function heatStatus(heat, jammed) {
  if (jammed || heat >= CRITICAL_THRESHOLD) return "critical";
  if (heat >= WARNING_THRESHOLD) return "warning";
  return "healthy";
}

function drawStationRoom(position, color) {
  k.add([
    k.rect(174, 126), k.color(k.Color.fromHex(COLORS.cocoa)),
    k.pos(position.add(k.vec2(5, 5))), k.anchor("center"), k.z(-17),
  ]);
  k.add([
    k.rect(174, 126), k.color(k.Color.fromHex("#fff4e2")),
    k.outline(4, k.Color.fromHex(COLORS.brown)), k.pos(position), k.anchor("center"), k.z(-16),
  ]);
  k.add([
    k.rect(164, 20), k.color(k.Color.fromHex(color)), k.outline(2, k.Color.fromHex(COLORS.brown)),
    k.pos(position.add(k.vec2(0, -53))), k.anchor("center"), k.z(-15),
  ]);
}

function drawStationIcon(stationId, position) {
  const iconPosition = position.add(k.vec2(0, 2));
  const iconColor = k.Color.fromHex(COLORS.brown);
  const iconParts = [];
  const shadowParts = [];
  const shadowOffset = k.vec2(3, 3);
  stationIconGroups.set(stationId, { center: iconPosition, parts: iconParts, shadowParts, shadowOffset, scale: 1, shadowOpacity: 0 });
  const addIconRect = (width, height, offset, color = iconColor, outlineWidth = 0, z = 3) => {
    const resolvedColor = typeof color === "string" ? k.Color.fromHex(color) : color;
    const shadow = k.add([
      k.rect(width, height), k.color(k.Color.fromHex(COLORS.red)), k.opacity(0), k.scale(1),
      k.pos(iconPosition.add(offset).add(shadowOffset)), k.anchor("center"), k.z(2),
    ]);
    const components = [k.rect(width, height), k.color(resolvedColor), k.scale(1)];
    if (outlineWidth) components.push(k.outline(outlineWidth, iconColor));
    components.push(k.pos(iconPosition.add(offset)), k.anchor("center"), k.z(z));
    const object = k.add(components);
    shadowParts.push({ object: shadow, offset });
    iconParts.push({ object, offset });
    return object;
  };
  const addIconCircle = (radius, offset, color, outlineWidth = 0, z = 4) => {
    const shadow = k.add([
      k.circle(radius), k.color(k.Color.fromHex(COLORS.red)), k.opacity(0), k.scale(1),
      k.pos(iconPosition.add(offset).add(shadowOffset)), k.anchor("center"), k.z(2),
    ]);
    const components = [k.circle(radius), k.color(k.Color.fromHex(color)), k.scale(1)];
    if (outlineWidth) components.push(k.outline(outlineWidth, iconColor));
    components.push(k.pos(iconPosition.add(offset)), k.anchor("center"), k.z(z));
    const object = k.add(components);
    shadowParts.push({ object: shadow, offset });
    iconParts.push({ object, offset });
    return object;
  };
  const drawMiniCupcake = (x, y, scale = 1, frostingColor = "#f7dfa0") => {
    const offset = (offsetY) => k.vec2(x, y + offsetY * scale);
    addIconRect(14 * scale, 10 * scale, offset(8), COLORS.brown, 0, 4);
    addIconRect(10 * scale, 7 * scale, offset(8), COLORS.red, 0, 5);
    addIconRect(18 * scale, 7 * scale, offset(2), COLORS.brown, 0, 5);
    addIconRect(14 * scale, 4 * scale, offset(2), frostingColor, 0, 6);
    addIconRect(14 * scale, 7 * scale, offset(-3), COLORS.brown, 0, 5);
    addIconRect(10 * scale, 4 * scale, offset(-3), frostingColor, 0, 6);
    addIconRect(8 * scale, 7 * scale, offset(-8), COLORS.brown, 0, 5);
    addIconRect(4 * scale, 4 * scale, offset(-8), COLORS.pink, 0, 6);
  };

  if (stationId === "oven") {
    addIconRect(54, 46, k.vec2(0, 0), COLORS.cocoa);
    addIconRect(44, 35, k.vec2(0, 4), COLORS.red);
    addIconRect(34, 21, k.vec2(0, 8), COLORS.cream, 2);
    addIconRect(25, 4, k.vec2(0, -6), COLORS.cocoa);
    addIconRect(5, 5, k.vec2(-15, -15), "#f7dfa0", 1);
    addIconRect(5, 5, k.vec2(-6, -15), COLORS.pink);
    addIconRect(5, 5, k.vec2(15, -15), "#f7dfa0", 1);
    return;
  }

  if (stationId === "displayCase") {
    addIconRect(72, 44, k.vec2(0, 2), COLORS.cocoa);
    addIconRect(69, 41, k.vec2(0, 2), COLORS.cream);
    addIconRect(72, 3, k.vec2(0, -20), COLORS.brown);
    addIconRect(72, 3, k.vec2(0, 24), COLORS.brown);
    for (const y of [-9, 11]) {
      for (const x of [-21, 0, 21]) {
        addIconCircle(7, k.vec2(x, y), COLORS.brown, 0, 5);
        addIconCircle(4, k.vec2(x, y), y < 0 ? "#f7dfa0" : COLORS.pink, 0, 6);
      }
    }
    return;
  }

  if (stationId === "recipeBook") {
    addIconRect(62, 7, k.vec2(0, 1), COLORS.brown);
    addIconRect(54, 3, k.vec2(0, 0), COLORS.cream);
    addIconRect(52, 9, k.vec2(0, 8), COLORS.brown);
    addIconRect(44, 5, k.vec2(0, 8), "#f7dfa0");
    addIconRect(42, 9, k.vec2(0, 15), COLORS.brown);
    addIconRect(34, 5, k.vec2(0, 15), "#f7dfa0");
    addIconRect(32, 9, k.vec2(0, 22), COLORS.brown);
    addIconRect(24, 5, k.vec2(0, 22), "#f7dfa0");
    addIconRect(4, 30, k.vec2(17, -13), COLORS.brown);
    addIconRect(15, 4, k.vec2(12, -26), COLORS.brown);
    return;
  }

  if (stationId === "frostingCounter") {
    drawMiniCupcake(0, 3, 2.15, COLORS.pink);
    return;
  }

  if (stationId === "decoratingCounter") {
    addIconCircle(11, k.vec2(-26, 7), COLORS.brown, 0, 5);
    addIconCircle(8, k.vec2(-26, 7), COLORS.red, 0, 6);
    addIconRect(3, 15, k.vec2(-21, -5), COLORS.brown, 0, 7);
    addIconRect(8, 4, k.vec2(-17, -11), COLORS.sage, 1, 6);

    addIconRect(14, 35, k.vec2(0, 6), COLORS.brown, 0, 5);
    addIconRect(9, 30, k.vec2(0, 6), COLORS.pink, 1, 6);
    addIconRect(9, 5, k.vec2(0, -2), COLORS.cream, 0, 7);
    addIconCircle(6, k.vec2(0, -19), "#f7dfa0", 2, 7);

    addIconRect(26, 10, k.vec2(26, -5), COLORS.brown, 0, 5);
    addIconRect(22, 6, k.vec2(26, -5), COLORS.red, 0, 6);
    addIconRect(20, 10, k.vec2(26, 3), COLORS.brown, 0, 5);
    addIconRect(16, 6, k.vec2(26, 3), COLORS.red, 0, 6);
    addIconRect(12, 10, k.vec2(26, 11), COLORS.brown, 0, 5);
    addIconRect(8, 6, k.vec2(26, 11), COLORS.red, 0, 6);
    return;
  }

  if (stationId === "deliveryStation") {
    addIconRect(54, 39, k.vec2(0, 5), COLORS.cocoa);
    addIconRect(47, 32, k.vec2(0, 5), "#f7dfa0");
    addIconRect(5, 32, k.vec2(0, 5), COLORS.brown);
    addIconRect(47, 4, k.vec2(0, -10), COLORS.cream);
    addIconRect(17, 11, k.vec2(13, 4), COLORS.cream, 1);
    addIconRect(10, 3, k.vec2(13, 2), COLORS.pink);
    addIconRect(23, 5, k.vec2(-13, -15), "#f7dfa0", 2);
    addIconRect(23, 5, k.vec2(13, -15), "#f7dfa0", 2);
    return;
  }

  if (stationId === "cafeTable") {
    addIconRect(66, 30, k.vec2(0, 10), COLORS.cocoa);
    addIconRect(58, 22, k.vec2(0, 9), "#f7dfa0");
    addIconRect(5, 22, k.vec2(-18, 9), COLORS.brown);
    addIconRect(5, 22, k.vec2(18, 9), COLORS.brown);
    addIconRect(74, 6, k.vec2(0, -4), COLORS.brown);
    addIconCircle(11, k.vec2(-21, -15), COLORS.brown, 0, 5);
    addIconCircle(8, k.vec2(-21, -15), COLORS.cream, 0, 6);
    addIconCircle(4, k.vec2(-21, -15), "#f7dfa0", 1, 7);
    addIconRect(18, 23, k.vec2(1, -14), COLORS.brown);
    addIconRect(12, 17, k.vec2(1, -14), COLORS.cream);
    addIconRect(16, 12, k.vec2(22, -12), COLORS.brown);
    addIconRect(10, 6, k.vec2(22, -12), COLORS.pink);
    return;
  }

  if (stationId === "bakeryDoor") {
    // A cupcake travels along the roller belt to the waiting customer.
    // Outlines and the belt's shape make this readable in either palette.
    for (const x of [-35, 13]) {
      addIconRect(7, 18, k.vec2(x, 25), COLORS.brown);
      addIconRect(3, 14, k.vec2(x, 25), COLORS.parchment, 0, 4);
    }
    addIconRect(78, 21, k.vec2(-11, 12), COLORS.cocoa);
    addIconRect(72, 15, k.vec2(-11, 12), COLORS.brown, 0, 4);
    for (const x of [-40, -26, -12, 2, 16]) {
      addIconCircle(5, k.vec2(x, 12), COLORS.parchment, 1, 5);
      addIconCircle(2, k.vec2(x, 12), COLORS.cocoa, 0, 6);
    }
    addIconRect(76, 4, k.vec2(-11, 0), COLORS.parchment, 1, 5);
    drawMiniCupcake(-18, -15, 1.05, COLORS.cream);

    addIconRect(25, 27, k.vec2(43, -18), COLORS.cocoa, 0, 4);
    addIconRect(17, 19, k.vec2(43, -15), "#d99a78", 1, 5);
    addIconRect(3, 3, k.vec2(39, -16), COLORS.cocoa, 0, 6);
    addIconRect(3, 3, k.vec2(47, -16), COLORS.cocoa, 0, 6);
    addIconRect(5, 2, k.vec2(43, -9), COLORS.cocoa, 0, 6);
    addIconRect(25, 31, k.vec2(43, 12), "#7695a8", 2, 4);
    addIconRect(12, 7, k.vec2(27, 4), "#d99a78", 1, 6);
    return;
  }
}

function updateStationIconHover() {
  const canHover = HOVER_CAPABLE.matches && gameCanvas.matches(":hover");
  const mousePosition = k.toWorld(k.mousePos());

  stationIconGroups.forEach((group, stationId) => {
    const stationPosition = STATION_POS[stationId];
    const isHovered = canHover
      && Math.abs(mousePosition.x - stationPosition.x) <= 87
      && Math.abs(mousePosition.y - stationPosition.y) <= 63;
    const targetScale = isHovered ? 1.12 : 1;
    const targetShadowOpacity = isHovered ? 0.28 : 0;
    if (!isHovered && Math.abs(group.scale - 1) < 0.001 && group.shadowOpacity < 0.001) return;
    const easing = Math.min(1, k.dt() * 12);
    group.scale += (targetScale - group.scale) * easing;
    group.shadowOpacity += (targetShadowOpacity - group.shadowOpacity) * easing;

    group.parts.forEach(({ object, offset }) => {
      object.scale = k.vec2(group.scale);
      object.pos = group.center.add(k.vec2(offset.x * group.scale, offset.y * group.scale));
    });
    group.shadowParts.forEach(({ object, offset }) => {
      object.scale = k.vec2(group.scale);
      object.opacity = group.shadowOpacity;
      object.pos = group.center.add(k.vec2(
        (offset.x + group.shadowOffset.x) * group.scale,
        (offset.y + group.shadowOffset.y) * group.scale,
      ));
    });
  });
}


function drawKitchen() {
  k.add([k.rect(GAME_WIDTH, GAME_HEIGHT), k.color(hex(COLORS.cream)), k.pos(0), k.z(-20)]);
  k.add([k.rect(GAME_WIDTH - 64, GAME_HEIGHT - 64), k.color(hex("#f3d2c5")), k.pos(32, 32), k.z(-19)]);
  for (let x = 48; x < GAME_WIDTH - 48; x += 48) {
    k.add([k.rect(32, 32), k.color(hex(x % 96 === 0 ? "#e8b9ad" : "#f7dfce")), k.pos(x, 64), k.z(-18)]);
  }
  k.add([k.rect(GAME_WIDTH - 64, 7), k.color(hex(COLORS.brown)), k.pos(32, 112), k.z(-17)]);
  // Floor path the baker walks between the two rows of stations.
  k.add([k.rect(GAME_WIDTH - 120, 34), k.color(hex("#ecc4b6")), k.pos(60, 311), k.z(-18)]);

  for (const station of STATIONS) {
    const position = STATION_POS[station.id];
    const [colorKey, screenColor] = STATION_COLORS[station.id];
    drawStationRoom(position, PALETTES.standard.titles[colorKey]);
    k.add([k.rect(116, 64), k.color(hex(COLORS.cocoa)), k.pos(position.add(k.vec2(4, 4))), k.anchor("center"), k.z(-1)]);
    k.add([k.pos(position), k.rect(116, 64), k.color(hex(screenColor)), k.outline(4, hex(COLORS.brown)), k.anchor("center")]);
    k.add([k.rect(104, 3), k.color(hex(COLORS.cream)), k.pos(position.add(k.vec2(0, -26))), k.anchor("center"), k.z(1)]);
    drawStationIcon(station.id, position);
  }
}

// A tiny pixel cupcake showing exactly what stage an item is at.
function drawCupcake(x, y, item, s, palette, { frostLayers = 3 } = {}) {
  const burnt = item.stage === "burnt";
  const flavorColor = burnt ? "#3a2419" : itemColor(FLAVORS[item.flavor], palette) ?? "#e8cf8f";
  const rect = (dx, dy, width, height, color, extra = {}) => k.drawRect({
    pos: k.vec2(x + dx * s, y + dy * s), width: width * s, height: height * s, anchor: "center", color: hex(color), ...extra,
  });
  if (item.boxed) rect(0, -1, 30, 30, "#f7dfa0", { outline: { width: 2, color: hex(COLORS.brown) } });
  rect(0, 7, 16, 11, "#fff4e2", { outline: { width: 2, color: hex(COLORS.cocoa) } });
  for (const dx of [-4, 0, 4]) rect(dx, 7, 1.5, 8, "#dcc39f");
  if (item.stage === "raw") {
    rect(0, 1.5, 14, 4, flavorColor);
  } else {
    rect(0, -1, 18, 7, flavorColor, { outline: { width: 1, color: hex(COLORS.cocoa) } });
    rect(0, -5, 12, 4, flavorColor);
  }
  if (item.frosting && frostLayers > 0) {
    const frosting = itemColor(FROSTINGS[item.frosting], palette);
    rect(0, -4, 20, 6, frosting, { outline: { width: 1, color: hex(COLORS.cocoa) } });
    if (frostLayers > 1) rect(0, -8.5, 14, 5, frosting, { outline: { width: 1, color: hex(COLORS.cocoa) } });
    if (frostLayers > 2) rect(0, -12, 6, 4, frosting);
  }
  if (item.topping === "sprinkles") {
    [[-6, -5], [4, -6], [-2, -9], [6, -3], [0, -13]].forEach(([dx, dy], index) => rect(dx, dy, 2, 2, palette.sprinkles[index]));
  } else if (item.topping === "cherry") {
    k.drawCircle({ pos: k.vec2(x, y - 15 * s), radius: 3.5 * s, color: hex(itemColor(TOPPINGS.cherry, palette)), outline: { width: 1, color: hex(COLORS.cocoa) } });
    rect(1.5, -19.5, 1.2, 4, COLORS.brown);
  } else if (item.topping === "candle") {
    rect(0, -17, 3, 10, itemColor(TOPPINGS.candle, palette));
    rect(0, -24, 3, 4, palette.warning);
  } else if (item.topping === "heart") {
    rect(-2, -17, 4, 4, itemColor(TOPPINGS.heart, palette));
    rect(2, -17, 4, 4, itemColor(TOPPINGS.heart, palette));
    rect(0, -14, 4, 3, itemColor(TOPPINGS.heart, palette));
  } else if (item.topping === "shavings") {
    [[-5, -6], [3, -9], [5, -4], [-1, -12]].forEach(([dx, dy]) => rect(dx, dy, 3, 1.6, itemColor(TOPPINGS.shavings, palette)));
  } else if (item.topping === "gold") {
    [[-5, -6], [4, -9], [0, -13], [6, -4]].forEach(([dx, dy]) => rect(dx, dy, 2.6, 2.6, itemColor(TOPPINGS.gold, palette)));
  }
  if (item.boxed) {
    const ribbons = palette === PALETTES.colorblind ? { berry: "#0072b2", sage: "#009e73", gold: "#e69f00" } : { berry: "#bd5656", sage: "#87966f", gold: "#d4a84f" };
    rect(0, -1, 2.5, 30, ribbons[item.bowColor ?? "berry"]);
  }
  if (burnt) {
    const t = k.time();
    k.drawCircle({ pos: k.vec2(x - 4 * s, y - 14 * s - (t * 10) % 8), radius: 3 * s, color: hex("#8b8078"), opacity: 0.6 });
    k.drawCircle({ pos: k.vec2(x + 4 * s, y - 18 * s - (t * 12 + 3) % 8), radius: 2.5 * s, color: hex("#8b8078"), opacity: 0.5 });
  }
}


// ---- Action close-ups ---------------------------------------------------------
// While the baker is busy at a station, a little close-up card plays the action
// (Papa's-style): ingredients tumble into the bowl, frosting is piped in
// layers, sprinkles rain down, the box folds shut...

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function closeUpItem(shift, busy) {
  const { hands, oven, display } = shift.state;
  const [kind, value] = busy.actionId.split(":");
  const raw = hands.find((item) => item.stage === "raw");
  const baked = hands.find((item) => item.stage === "baked" && !item.frosting);
  const frosted = hands.find((item) => item.stage === "baked" && item.frosting && !item.topping);
  const finished = hands.find((item) => item.stage === "baked" && item.frosting);
  if (kind === "flavor") return { flavor: value, stage: "raw" };
  if (kind === "bake" || kind === "turbo") return raw;
  if (kind === "takeOut") return oven.find((slot) => slot && slot.item.stage !== "baking")?.item;
  if (kind === "frost") return baked && { ...baked, frosting: value };
  if (kind === "top") return frosted && { ...frosted, topping: value };
  if (kind === "box") return finished;
  if (kind === "serve") return hands.find((item) => String(item.id) === busy.actionId.split(":")[2]);
  if (kind === "store") return hands[0];
  if (kind === "take") return display[Number(value)];
  if (kind === "trash") return hands.find((item) => item.stage === "burnt") ?? hands[0];
  return null;
}

function drawCloseUp(shift, palette, text) {
  const busy = shift.state.busy;
  if (!busy) return;
  const { x, y } = STATION_POS[busy.stationId];
  const p = clamp((shift.state.time - busy.startedAt) / Math.max(0.01, busy.until - busy.startedAt), 0, 1);
  const t = k.time();
  const [kind, value] = busy.actionId.split(":");
  const item = closeUpItem(shift, busy);
  const cx = x;
  const cy = y + 4;
  const scale = 2.3;

  k.drawRect({ pos: k.vec2(cx + 4, cy + 4), width: 150, height: 98, anchor: "center", color: hex(COLORS.cocoa), opacity: 0.5 });
  k.drawRect({ pos: k.vec2(cx, cy), width: 150, height: 98, anchor: "center", color: hex("#fffaf0"), outline: { width: 3, color: hex(COLORS.brown) } });
  const floorY = cy + 34;
  k.drawRect({ pos: k.vec2(cx, floorY + 6), width: 144, height: 12, anchor: "center", color: hex("#f2d6ad") });

  if (kind === "flavor") {
    // Egg, flour and butter arc into the bowl; the batter rises.
    const bowlY = floorY - 8;
    k.drawRect({ pos: k.vec2(cx, bowlY), width: 62, height: 22, anchor: "center", color: hex("#fff4e2"), outline: { width: 3, color: hex(COLORS.cocoa) } });
    const fill = easeOut(p);
    k.drawRect({ pos: k.vec2(cx, bowlY + 9 - 8 * fill), width: 54, height: 16 * fill, anchor: "center", color: hex(itemColor(FLAVORS[value], palette)) });
    const drops = [["#fffdf6", -46, "egg"], ["#f4efe3", 0, "flour"], ["#f7dfa0", 46, "butter"]];
    drops.forEach(([color, startX, name], index) => {
      const local = clamp(p * 3 - index * 0.8, 0, 1);
      if (local <= 0 || local >= 1) return;
      const px = lerp(cx + startX, cx, local);
      const py = lerp(cy - 36, bowlY - 6, local) - Math.sin(local * Math.PI) * 18;
      if (name === "egg") k.drawCircle({ pos: k.vec2(px, py), radius: 7, color: hex(color), outline: { width: 2, color: hex(COLORS.cocoa) } });
      else k.drawRect({ pos: k.vec2(px, py), width: name === "flour" ? 14 : 16, height: name === "flour" ? 16 : 9, anchor: "center", color: hex(color), outline: { width: 2, color: hex(COLORS.cocoa) } });
    });
    for (let i = 0; i < 4; i += 1) {
      const puff = (t * 1.6 + i * 0.25) % 1;
      k.drawCircle({ pos: k.vec2(cx - 20 + i * 13, bowlY - 12 - puff * 18), radius: 3 + puff * 3, color: hex("#ffffff"), opacity: (1 - puff) * 0.8 });
    }
    text(`${FLAVORS[value].name} batter`, cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if ((kind === "bake" || kind === "turbo" || kind === "takeOut") && item) {
    // The tray slides in (or out of) a glowing oven.
    k.drawRect({ pos: k.vec2(cx + 30, cy + 4), width: 64, height: 58, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(cx + 30, cy + 8), width: 50, height: 36, anchor: "center", color: hex(kind === "turbo" ? "#e8743b" : "#f0a35b"), opacity: 0.6 + Math.sin(t * 12) * 0.2 });
    const slide = kind === "takeOut" ? p : 1 - p;
    drawCupcake(lerp(cx + 30, cx - 44, easeOut(slide)), cy + 6, item, 1.9, palette);
    if (kind === "turbo") {
      for (let i = 0; i < 4; i += 1) k.drawRect({ pos: k.vec2(cx + 10 + i * 13, cy + 30 - (Math.sin(t * 20 + i) + 1) * 4), width: 6, height: 10, anchor: "bot", color: hex(palette.turbo) });
    }
    text(kind === "takeOut" ? "Out of the oven!" : kind === "turbo" ? "Turbo!" : "Into the oven", cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if (kind === "frost" && item) {
    // Pipe the frosting on, one swirl at a time.
    const layers = p < 0.34 ? 1 : p < 0.67 ? 2 : 3;
    drawCupcake(cx, floorY - 22, item, scale, palette, { frostLayers: layers });
    const angle = p * Math.PI * 6;
    const bagX = cx + Math.cos(angle) * lerp(22, 6, p);
    const bagY = floorY - 58 - layers * 6;
    k.drawRect({ pos: k.vec2(bagX, bagY - 14), width: 16, height: 22, anchor: "center", color: hex("#fff4e2"), outline: { width: 2, color: hex(COLORS.cocoa) } });
    k.drawRect({ pos: k.vec2(bagX, bagY - 2), width: 6, height: 6, anchor: "center", color: hex(itemColor(FROSTINGS[value], palette)), outline: { width: 1, color: hex(COLORS.cocoa) } });
    text(`${FROSTINGS[value].name} frosting`, cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if (kind === "top" && item) {
    // Toppings rain down onto the cupcake.
    drawCupcake(cx, floorY - 22, { ...item, topping: p > 0.85 ? value : null }, scale, palette);
    const color = value === "sprinkles" ? null : itemColor(TOPPINGS[value], palette);
    for (let i = 0; i < 12; i += 1) {
      const fall = clamp(p * 1.4 - (i % 6) * 0.08, 0, 1);
      if (fall <= 0 || fall >= 1) continue;
      const px = cx - 18 + ((i * 37) % 36);
      const py = lerp(cy - 44, floorY - 44, fall);
      const dropColor = color ?? palette.sprinkles[i % palette.sprinkles.length];
      if (value === "cherry" && i === 0) k.drawCircle({ pos: k.vec2(cx, lerp(cy - 44, floorY - 55, easeOut(p))), radius: 8, color: hex(dropColor), outline: { width: 2, color: hex(COLORS.cocoa) } });
      else if (value !== "cherry") k.drawRect({ pos: k.vec2(px, py), width: value === "shavings" ? 7 : 4, height: value === "shavings" ? 3 : 4, anchor: "center", color: hex(dropColor), angle: t * 200 + i * 40 });
    }
    if (value === "gold") for (let i = 0; i < 4; i += 1) text("✦", cx - 30 + i * 20, floorY - 60 + Math.sin(t * 8 + i) * 6, 9, palette.warning);
    text(TOPPINGS[value].name, cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if (kind === "box" && item) {
    // The box folds up around the cupcake and gets a ribbon.
    drawCupcake(cx, floorY - 22, { ...item, boxed: false }, scale, palette);
    const wall = easeOut(clamp(p / 0.6, 0, 1));
    k.drawRect({ pos: k.vec2(cx - 32, floorY), width: 10, height: 62 * wall, anchor: "bot", color: hex("#f7dfa0"), outline: { width: 2, color: hex(COLORS.brown) } });
    k.drawRect({ pos: k.vec2(cx + 32, floorY), width: 10, height: 62 * wall, anchor: "bot", color: hex("#f7dfa0"), outline: { width: 2, color: hex(COLORS.brown) } });
    if (p > 0.6) k.drawRect({ pos: k.vec2(cx, floorY - 62), width: 74 * easeOut((p - 0.6) / 0.4), height: 10, anchor: "center", color: hex("#f7dfa0"), outline: { width: 2, color: hex(COLORS.brown) } });
    if (p > 0.85) {
      k.drawRect({ pos: k.vec2(cx, floorY - 31), width: 8, height: 62, anchor: "center", color: hex(palette.bad) });
      k.drawCircle({ pos: k.vec2(cx - 7, floorY - 68), radius: 6, color: hex(palette.bad) });
      k.drawCircle({ pos: k.vec2(cx + 7, floorY - 68), radius: 6, color: hex(palette.bad) });
    }
    text("Boxing it up", cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if (kind === "serve" && item) {
    // Hand the cupcake to a happy customer.
    k.drawCircle({ pos: k.vec2(cx + 40, cy - 2), radius: 20, color: hex("#f2c4a8"), outline: { width: 3, color: hex(COLORS.cocoa) } });
    k.drawRect({ pos: k.vec2(cx + 33, cy - 6), width: 4, height: 4, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(cx + 47, cy - 6), width: 4, height: 4, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(cx + 40, cy + 6), width: p > 0.5 ? 14 : 8, height: 3, anchor: "center", color: hex(COLORS.cocoa) });
    drawCupcake(lerp(cx - 40, cx + 10, easeOut(p)), cy + 14, item, 1.9, palette);
    if (p > 0.6) text("♥", cx + 40, cy - 30 - (p - 0.6) * 30, 14, palette.bad);
    return;
  }

  if (kind === "cool") {
    // A cooling spray: blue mist and snowflakes.
    k.drawRect({ pos: k.vec2(cx, cy), width: 144, height: 92, anchor: "center", color: hex(palette.cheer), opacity: 0.25 * (1 - p) });
    for (let i = 0; i < 10; i += 1) {
      const fall = (p * 1.5 + i * 0.1) % 1;
      text("❄", cx - 60 + i * 13, lerp(cy - 44, cy + 40, fall), 10, palette.healthy);
    }
    text("Cooling down", cx, cy - 38, 9, COLORS.brown);
    return;
  }

  if (item) {
    // Store, take, or toss: the cupcake slides where it's going.
    const drop = kind === "trash";
    drawCupcake(cx, drop ? lerp(cy - 10, cy + 30, p) : cy + 6, item, 1.9, palette);
    if (drop) k.drawRect({ pos: k.vec2(cx, floorY), width: 50, height: 26, anchor: "center", color: hex("#8b8078"), outline: { width: 2, color: hex(COLORS.cocoa) } });
    text(drop ? "Into the bin" : kind === "store" ? "Into the case" : "Got it", cx, cy - 38, 9, COLORS.brown);
  }
}

// The oven glows while it bakes, puffs steam, and flickers red on turbo.
function drawOvenAmbience(shift, palette) {
  const { x, y } = STATION_POS.oven;
  const t = k.time();
  const baking = shift.state.oven.filter((slot) => slot?.item.stage === "baking");
  if (!baking.length) return;
  const turbo = baking.some((slot) => slot.turbo);
  k.drawRect({ pos: k.vec2(x, y + 10), width: 32, height: 19, anchor: "center", color: hex(turbo ? "#e8743b" : "#f5b061"), opacity: 0.45 + Math.sin(t * (turbo ? 14 : 5)) * 0.15 });
  for (let i = 0; i < 3; i += 1) {
    const rise = (t * 0.7 + i / 3) % 1;
    k.drawCircle({ pos: k.vec2(x - 14 + i * 14 + Math.sin(t * 3 + i) * 4, y - 26 - rise * 26), radius: 4 + rise * 5, color: hex("#ffffff"), opacity: 0.7 * (1 - rise) });
  }
  if (turbo) {
    for (let i = 0; i < 4; i += 1) k.drawRect({ pos: k.vec2(x - 18 + i * 12, y + 26), width: 5, height: 6 + (Math.sin(t * 22 + i * 2) + 1) * 4, anchor: "bot", color: hex(palette.turbo) });
  }
}

export function createBakeryScene({
  getShift,
  getCharacter,
  getTextScale,
  getPalette,
  isPaused,
  onArrive,
  onLeave,
  onClickSound,
  onFrame,
}) {
  let player = null;
  let playerParts = null;
  let destination = null;
  let targetStation = null;
  let atStation = null;
  const floats = [];
  const pulses = [];
  const bursts = [];
  let guideStation = null;

  const text = (value, x, y, size, color, extra = {}) => k.drawText({
    text: value, pos: k.vec2(x, y), size: size * getTextScale(), font: "monospace", color: hex(color), anchor: "center", ...extra,
  });

  function stationAt(point) {
    return STATIONS.find(({ id }) => {
      const position = STATION_POS[id];
      return Math.abs(point.x - position.x) <= ROOM_HALF_WIDTH && Math.abs(point.y - position.y) <= ROOM_HALF_HEIGHT;
    })?.id ?? null;
  }

  function leaveStation() {
    if (!atStation) return;
    atStation = null;
    onLeave();
  }

  // Accept the next destination during an action; update() waits for it to finish.
  // Dropping these clicks made fast station transitions appear stuck.
  function walkTo(stationId) {
    if (!player) return;
    if (atStation === stationId && !destination) {
      onArrive(stationId);
      return;
    }
    leaveStation();
    targetStation = stationId;
    destination = STATION_POS[stationId].add(k.vec2(0, 6));
  }

  function walkToPoint(point) {
    if (!player) return;
    leaveStation();
    targetStation = null;
    destination = k.vec2(clamp(point.x, 70, GAME_WIDTH - 70), clamp(point.y, 170, GAME_HEIGHT - 112));
  }

  function positionPlayerParts() {
    const character = getCharacter();
    playerParts.hair.pos = player.pos.add(k.vec2(0, character.hairShape.y));
    playerParts.outfit.pos = player.pos.add(k.vec2(0, 16));
    playerParts.leftEye.pos = player.pos.add(k.vec2(-6, -3));
    playerParts.rightEye.pos = player.pos.add(k.vec2(6, -3));
  }

  function removePlayer() {
    [player, ...Object.values(playerParts ?? {})].forEach((object) => object?.destroy());
    player = null;
    playerParts = null;
  }

  function resetPlayer() {
    removePlayer();
    const character = getCharacter();
    player = k.add([
      k.rect(28, 30), k.color(hex(character.skin)), k.outline(2, hex(COLORS.cocoa)),
      k.pos(GAME_WIDTH / 2, 328), k.anchor("center"), k.z(20),
    ]);
    playerParts = {
      hair: k.add([k.rect(character.hairShape.width, character.hairShape.height), k.color(hex(character.hair)), k.outline(2, hex(COLORS.cocoa)), k.pos(0, 0), k.anchor("center"), k.z(19)]),
      outfit: k.add([k.rect(30, 22), k.color(hex(character.shirt)), k.outline(2, hex(COLORS.cocoa)), k.pos(0, 0), k.anchor("center"), k.z(21)]),
      leftEye: k.add([k.rect(4, 4), k.color(hex(character.eyes)), k.outline(1, hex("#2b1b1b")), k.pos(0, 0), k.anchor("center"), k.z(22)]),
      rightEye: k.add([k.rect(4, 4), k.color(hex(character.eyes)), k.outline(1, hex("#2b1b1b")), k.pos(0, 0), k.anchor("center"), k.z(22)]),
    };
    positionPlayerParts();
    destination = null;
    targetStation = null;
    atStation = null;
  }

  function handleClick() {
    if (isPaused() || !player) return;
    const point = k.toWorld(k.mousePos());
    const station = stationAt(point);
    if (station) {
      onClickSound?.();
      walkTo(station);
    } else {
      walkToPoint(point);
    }
  }

  function update() {
    updateStationIconHover();
    if (isPaused() || !player || !destination || getShift()?.state.busy) return;
    const speed = getShift()?.state.walkSpeed ?? RULES.walkSpeed;
    if (player.pos.dist(destination) >= 4) {
      player.moveTo(destination, speed);
      positionPlayerParts();
      return;
    }
    destination = null;
    if (targetStation) {
      atStation = targetStation;
      targetStation = null;
      onArrive(atStation);
    }
  }

  function drawStationLabels(scale, shift, palette) {
    const mouse = k.toWorld(k.mousePos());
    const hovered = HOVER_CAPABLE.matches && gameCanvas.matches(":hover") ? stationAt(mouse) : null;
    for (const station of STATIONS) {
      const { x, y } = station;
      const [colorKey] = STATION_COLORS[station.id];
      const color = palette.titles[colorKey];
      const titleColor = colorKey === "red" ? COLORS.cream : COLORS.brown;
      const titleHeight = Math.max(20, 17 * scale + 4);
      if (hovered === station.id && shift) {
        k.drawRect({ pos: k.vec2(x, y), width: 184, height: 136, anchor: "center", fill: false, outline: { width: 3, color: hex(palette.hover) } });
      }
      k.drawRect({ pos: k.vec2(x, y - 53), width: 164, height: titleHeight, anchor: "center", color: hex(color), outline: { width: 2, color: hex(COLORS.brown) } });
      text(station.title, x, y - 53, 13, titleColor);
      const plaqueHeight = Math.max(18, 13 * scale + 5);
      k.drawRect({ pos: k.vec2(x + 3, y + 53), width: 156, height: plaqueHeight, anchor: "center", color: hex(COLORS.cocoa) });
      k.drawRect({ pos: k.vec2(x, y + 50), width: 156, height: plaqueHeight, anchor: "center", color: hex("#fff4e2"), outline: { width: 2, color: hex(COLORS.brown) } });
      text(station.role, x, y + 50, 10, COLORS.brown, { width: 152, align: "center" });
      // Optional keyboard shortcut, as a small tag in the station's corner.
      const keySize = 16 * Math.max(1, scale * 0.9);
      k.drawRect({ pos: k.vec2(x - 78, y - 60), width: keySize + 4, height: keySize + 4, anchor: "center", color: hex("#fff8e8"), outline: { width: 2, color: hex(COLORS.cocoa) } });
      text(station.key.toUpperCase(), x - 78, y - 59, 10, COLORS.cocoa);

      if (!shift || !(station.id in shift.state.heat)) continue;
      const heat = shift.state.heat[station.id];
      const jammed = shift.state.jammed.has(station.id);
      const status = heatStatus(heat, jammed);
      if (heat > 0.01 || jammed) {
        k.drawRect({ pos: k.vec2(x, y - 38), width: 120, height: 6, anchor: "center", color: hex(COLORS.cocoa), opacity: 0.35 });
        k.drawRect({ pos: k.vec2(x - 60, y - 38), width: 120 * heat, height: 6, anchor: "left", color: hex(palette[status]) });
      }
      const badge = k.vec2(x + 60, y - 60);
      k.drawRect({ pos: badge, width: 52, height: 20 * scale, anchor: "center", color: hex(palette[status]), outline: { width: 2, color: hex(COLORS.cocoa) } });
      text(HEAT_SYMBOL[status], badge.x, badge.y + 1, 9, palette.symbol[status]);
      if (jammed) {
        const pulse = 0.22 + Math.sin(k.time() * 6) * 0.06;
        k.drawRect({ pos: k.vec2(x, y), width: 174, height: 126, anchor: "center", color: hex(palette.critical), opacity: pulse });
        for (let i = 0; i < 3; i += 1) {
          const rise = (k.time() * 18 + i * 14) % 40;
          k.drawCircle({ pos: k.vec2(x - 30 + i * 30, y - 10 - rise), radius: 6 + rise / 8, color: hex("#8b8078"), opacity: 0.5 * (1 - rise / 40) });
        }
        k.drawRect({ pos: k.vec2(x, y + 18), width: 150, height: 30 * Math.max(1, scale * 0.85), anchor: "center", color: hex(COLORS.cocoa), opacity: 0.88 });
        text("OVERHEATED!", x, y + 11, 11, "#fff8e8");
        text("Press 1 to cool", x, y + 25, 8, "#f2cf83");
      }
    }
  }

  function drawOven(shift, palette) {
    const { x, y } = STATION_POS.oven;
    const slots = shift.state.oven;
    const width = 30;
    const gap = 6;
    const startX = x - ((slots.length - 1) * (width + gap)) / 2;
    slots.forEach((slot, index) => {
      const sx = startX + index * (width + gap);
      const sy = y + 33;
      k.drawRect({ pos: k.vec2(sx, sy), width, height: 10, anchor: "center", color: hex(COLORS.cocoa) });
      if (!slot) return;
      const elapsed = shift.state.time - slot.startedAt;
      if (slot.item.stage === "baking") {
        k.drawRect({ pos: k.vec2(sx - width / 2 + 1, sy), width: (width - 2) * Math.min(1, elapsed / slot.duration), height: 8, anchor: "left", color: hex(slot.turbo ? palette.turbo : palette.bake) });
      } else if (slot.item.stage === "baked") {
        const burn = Math.min(1, (elapsed - slot.duration) / RULES.burnGrace);
        k.drawRect({ pos: k.vec2(sx, sy), width: width - 2, height: 8, anchor: "center", color: hex(palette.ready) });
        k.drawRect({ pos: k.vec2(sx - width / 2 + 1, sy), width: (width - 2) * burn, height: 8, anchor: "left", color: hex(palette.burning) });
        if (Math.sin(k.time() * 10) > -0.3) text("✓", sx, sy - 12, 12, COLORS.cocoa);
      } else {
        k.drawRect({ pos: k.vec2(sx, sy), width: width - 2, height: 8, anchor: "center", color: hex(palette.burnt) });
        text("✕", sx, sy - 12, 12, palette.bad);
      }
    });
  }

  function drawDisplayCase(shift, palette) {
    const { x, y } = STATION_POS.displayCase;
    shift.state.display.forEach((item, index) => {
      if (item) drawCupcake(x - 20 + index * 40, y + 26, item, 0.9, palette);
    });
  }

  function drawPlayerExtras(shift, palette) {
    if (!player) return;
    const hands = shift?.state.hands ?? [];
    hands.forEach((item, index) => {
      const offset = hands.length > 1 ? (index === 0 ? -14 : 14) : 0;
      drawCupcake(player.pos.x + offset, player.pos.y - 52, item, 1.1, palette);
    });
    const busy = shift?.state.busy;
    if (busy) {
      const progress = clamp((shift.state.time - busy.startedAt) / (busy.until - busy.startedAt), 0, 1);
      k.drawRect({ pos: k.vec2(player.pos.x, player.pos.y + 36), width: 44, height: 8, anchor: "center", color: hex(COLORS.cocoa) });
      k.drawRect({ pos: k.vec2(player.pos.x - 21, player.pos.y + 36), width: 42 * progress, height: 6, anchor: "left", color: hex(palette.bake) });
    }
    const name = getCharacter().name;
    if (name) text(name, player.pos.x, player.pos.y + 50, 10, COLORS.brown);
  }

  function drawEffects() {
    const now = k.time();
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      const t = (now - pulse.born) / 0.6;
      if (t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const { x, y } = STATION_POS[pulse.station];
      k.drawRect({ pos: k.vec2(x, y), width: 176 + t * 40, height: 128 + t * 40, anchor: "center", fill: false, opacity: 1 - t, outline: { width: 4, color: hex(getPalette()[pulse.colorKey] ?? pulse.colorKey) } });
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const float = floats[i];
      const t = (now - float.born) / float.life;
      if (t >= 1) {
        floats.splice(i, 1);
        continue;
      }
      const y = float.y - t * 46;
      const size = float.size;
      text(float.text, float.x + 1.5, y + 1.5, size, "#fff8e8", { opacity: 1 - t * t });
      text(float.text, float.x, y, size, getPalette()[float.color] ?? float.color, { opacity: 1 - t * t });
    }
  }

  // A bouncing arrow and glow on the station a tip is pointing at.
  function drawGuide(palette) {
    if (!guideStation) return;
    const { x, y } = STATION_POS[guideStation];
    const bounce = Math.abs(Math.sin(k.time() * 5)) * 8;
    k.drawRect({ pos: k.vec2(x, y), width: 186 + bounce, height: 138 + bounce, anchor: "center", fill: false, outline: { width: 4, color: hex(palette.hover) } });
    const tipY = y - 74 - bounce;
    k.drawRect({ pos: k.vec2(x, tipY - 14), width: 12, height: 16, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(x, tipY - 2), width: 26, height: 6, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(x, tipY + 4), width: 14, height: 6, anchor: "center", color: hex(COLORS.cocoa) });
    k.drawRect({ pos: k.vec2(x, tipY - 14), width: 7, height: 13, anchor: "center", color: hex(palette.hover) });
    k.drawRect({ pos: k.vec2(x, tipY - 3), width: 19, height: 3, anchor: "center", color: hex(palette.hover) });
  }

  function drawBursts(palette) {
    const now = k.time();
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      const t = (now - burst.born) / 0.9;
      if (t >= 1) {
        bursts.splice(i, 1);
        continue;
      }
      burst.pieces.forEach((piece, index) => {
        const px = burst.x + piece.dx * easeOut(t) * 60;
        const py = burst.y + piece.dy * easeOut(t) * 50 + t * t * 30;
        const color = burst.kind === "sprinkles" ? palette.sprinkles[index % palette.sprinkles.length] : burst.kind === "flour" ? "#ffffff" : palette[burst.kind] ?? burst.kind;
        if (burst.kind === "hearts") text("♥", px, py, 11, palette.bad, { opacity: 1 - t });
        else if (burst.kind === "stars") text("★", px, py, 12, palette.warning, { opacity: 1 - t });
        else k.drawRect({ pos: k.vec2(px, py), width: 5, height: 5, anchor: "center", color: hex(color), opacity: 1 - t, angle: t * 360 + index * 30 });
      });
    }
  }

  function draw() {
    const shift = getShift();
    const palette = getPalette();
    drawStationLabels(getTextScale(), shift, palette);
    if (shift) {
      drawOvenAmbience(shift, palette);
      drawOven(shift, palette);
      drawDisplayCase(shift, palette);
      drawCloseUp(shift, palette, text);
    }
    drawGuide(palette);
    drawPlayerExtras(shift, palette);
    drawBursts(palette);
    drawEffects();
  }

  k.scene("bakery", () => {
    drawKitchen();
    k.onMousePress("left", handleClick);
    // Kaboom clears handlers on scene change, so the game loop lives here too.
    k.onUpdate(() => {
      onFrame?.(Math.min(k.dt(), 0.1));
      update();
    });
    // Overlays live on a top-layer object so they draw above the baker.
    k.add([k.pos(0, 0), k.z(100), { id: "overlay", draw }]);
  });
  k.go("bakery");

  return {
    resetPlayer,
    removePlayer,
    walkTo,
    get atStation() {
      return atStation;
    },
    stationPosition: (id) => STATION_POS[id],
    playerPosition: () => player?.pos ?? k.vec2(GAME_WIDTH / 2, 328),
    addFloat(value, x, y, color = COLORS.cocoa, /* hex or palette key */ { size = 14, life = 1.4 } = {}) {
      floats.push({ text: value, x, y, color, size, life, born: k.time() });
    },
    // `color` is a palette key (e.g. "heatWave") so pulses follow the color setting.
    pulse(station, colorKey = "heatWave") {
      if (STATION_POS[station]) pulses.push({ station, colorKey, born: k.time() });
    },
    setGuide(stationId) {
      guideStation = stationId && STATION_POS[stationId] ? stationId : null;
    },
    // kind: "flour" | "sprinkles" | "hearts" | "stars" | a palette key
    burst(stationId, kind) {
      const position = STATION_POS[stationId];
      if (!position) return;
      const pieces = Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return { dx: Math.cos(angle) * (0.6 + (index % 3) * 0.2), dy: Math.sin(angle) * (0.6 + (index % 2) * 0.3) - 0.4 };
      });
      bursts.push({ x: position.x, y: position.y - 10, kind, pieces, born: k.time() });
    },
    stopWalking() {
      destination = null;
      targetStation = null;
    },
  };
}
