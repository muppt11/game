// Everything the bakery game is tuned by: stations, menu, secret combos,
// upgrades, and day difficulty. Kept free of DOM/Kaboom so it can be tested.

// The kitchen is laid out as a loop: along the top row the cupcake goes
// Ingredients -> Oven -> Frosting -> Toppings, then back along the bottom row
// through Packaging and Serving. x/y are Kaboom world coordinates (960x540).
export const STATIONS = [
  { id: "cafeTable", title: "Ingredients", role: "Pick a flavor", key: "q", x: 139, y: 240 },
  { id: "oven", title: "Oven", role: "Bake", key: "w", x: 365, y: 240 },
  { id: "frostingCounter", title: "Frosting", role: "Frost", key: "e", x: 595, y: 240 },
  { id: "decoratingCounter", title: "Toppings", role: "Add a topping", key: "r", x: 821, y: 240 },
  { id: "recipeBook", title: "Recipe Book", role: "Secret combos", key: "a", x: 139, y: 415 },
  { id: "displayCase", title: "Display Case", role: "Store cupcakes", key: "s", x: 365, y: 415 },
  { id: "bakeryDoor", title: "Serving", role: "Serve customers", key: "d", x: 595, y: 415 },
  { id: "deliveryStation", title: "Packaging", role: "Box to-go orders", key: "f", x: 821, y: 415 },
];

export const stationById = (id) => STATIONS.find((station) => station.id === id);

// Heat flows along the real production line. When one station overheats, the
// shock cascades downstream through these edges (see chainReaction.js).
export const KITCHEN_NODES = STATIONS.filter((station) => station.id !== "recipeBook").map(({ id, title }) => ({ id, label: title }));
export const KITCHEN_EDGES = [
  { from: "cafeTable", to: "oven", weight: 0.6, delay: 380 },
  { from: "oven", to: "frostingCounter", weight: 0.85, delay: 320 },
  { from: "oven", to: "displayCase", weight: 0.5, delay: 420 },
  { from: "frostingCounter", to: "decoratingCounter", weight: 0.85, delay: 320 },
  { from: "decoratingCounter", to: "deliveryStation", weight: 0.75, delay: 320 },
  { from: "decoratingCounter", to: "bakeryDoor", weight: 0.5, delay: 460 },
  { from: "deliveryStation", to: "bakeryDoor", weight: 0.8, delay: 320 },
  { from: "displayCase", to: "bakeryDoor", weight: 0.5, delay: 380 },
];

// `color` is the everyday look; `cbColor` is the Okabe-Ito colorblind-safe
// version, chosen so every item in a category differs in hue and lightness.
export const FLAVORS = {
  vanilla: { name: "Vanilla", value: 4, color: "#e8cf8f", cbColor: "#F0E442", cost: 0 },
  chocolate: { name: "Chocolate", value: 5, color: "#8a5a45", cbColor: "#5b3a29", cost: 0 },
  strawberry: { name: "Strawberry", value: 5, color: "#e3a0a6", cbColor: "#CC79A7", cost: 0 },
  lemon: { name: "Lemon", value: 7, color: "#f2dc6b", cbColor: "#E69F00", cost: 60 },
  redvelvet: { name: "Red Velvet", value: 9, color: "#a8443f", cbColor: "#D55E00", cost: 90 },
};

// `time` is how long the player is busy applying it: premium = slower.
export const FROSTINGS = {
  buttercream: { name: "Buttercream", value: 3, color: "#fbf1d6", cbColor: "#fff6d8", time: 0.9, cost: 0 },
  chocolate: { name: "Chocolate", value: 4, color: "#6b3f30", cbColor: "#3b2318", time: 0.9, cost: 0 },
  strawberry: { name: "Strawberry", value: 4, color: "#f0a3b5", cbColor: "#CC79A7", time: 0.9, cost: 0 },
  creamcheese: { name: "Cream Cheese", value: 6, color: "#fffaf0", cbColor: "#56B4E9", time: 1.2, cost: 70 },
  caramel: { name: "Salted Caramel", value: 9, color: "#c98a3d", cbColor: "#E69F00", time: 1.5, cost: 110 },
};

export const TOPPINGS = {
  none: { name: "Plain", value: 0, color: null, time: 0, cost: 0 },
  sprinkles: { name: "Sprinkles", value: 2, color: "#e98f9d", cbColor: "#CC79A7", time: 0.7, cost: 0 },
  cherry: { name: "Cherry", value: 3, color: "#c0392b", cbColor: "#D55E00", time: 0.7, cost: 0 },
  shavings: { name: "Choc Shavings", value: 3, color: "#4a2a20", cbColor: "#1f1410", time: 0.7, cost: 0 },
  gold: { name: "Gold Flakes", value: 8, color: "#e3b53b", cbColor: "#F0E442", time: 1.1, cost: 120 },
};

export const STARTING_MENU = {
  flavors: ["vanilla", "chocolate", "strawberry"],
  frostings: ["buttercream", "chocolate", "strawberry"],
  toppings: ["none", "sprinkles", "cherry", "shavings"],
};

export const FULL_MENU = {
  flavors: Object.keys(FLAVORS),
  frostings: Object.keys(FROSTINGS),
  toppings: Object.keys(TOPPINGS),
};

// Secret recipes: serving one multiplies the cupcake's value.
export const COMBOS = [
  { id: "birthday", name: "Birthday Party", flavor: "vanilla", frosting: "buttercream", topping: "sprinkles", mult: 1.5 },
  { id: "blackforest", name: "Black Forest", flavor: "chocolate", frosting: "buttercream", topping: "cherry", mult: 1.6 },
  { id: "triplechoc", name: "Triple Chocolate", flavor: "chocolate", frosting: "chocolate", topping: "shavings", mult: 1.6 },
  { id: "neapolitan", name: "Neapolitan", flavor: "strawberry", frosting: "chocolate", topping: "sprinkles", mult: 1.5 },
  { id: "berrycream", name: "Strawberries & Cream", flavor: "strawberry", frosting: "creamcheese", topping: "cherry", mult: 1.8 },
  { id: "lemondrop", name: "Lemon Drop", flavor: "lemon", frosting: "buttercream", topping: "sprinkles", mult: 1.8 },
  { id: "velvet", name: "Red Velvet Classic", flavor: "redvelvet", frosting: "creamcheese", topping: "shavings", mult: 2 },
  { id: "goldenhour", name: "Golden Hour", flavor: "vanilla", frosting: "caramel", topping: "gold", mult: 2.5 },
];

export function comboFor(item) {
  if (!item?.frosting) return null;
  const topping = item.topping ?? "none";
  return COMBOS.find((combo) => combo.flavor === item.flavor && combo.frosting === item.frosting && combo.topping === topping) ?? null;
}

export function cupcakeValue(item) {
  const base = FLAVORS[item.flavor].value + FROSTINGS[item.frosting].value + TOPPINGS[item.topping ?? "none"].value;
  const combo = comboFor(item);
  return Math.round(base * (combo?.mult ?? 1));
}

export function describeCupcake({ flavor, frosting, topping }) {
  const parts = [FLAVORS[flavor]?.name];
  if (frosting) parts.push(`${FROSTINGS[frosting].name} frosting`);
  if (topping && topping !== "none") parts.push(TOPPINGS[topping].name);
  return parts.filter(Boolean).join(", ");
}

export const UPGRADES = [
  { id: "ovenRack", name: "Extra Oven Rack", desc: "Bake one more cupcake at a time.", costs: [70, 140] },
  { id: "hotOven", name: "Hotter Oven", desc: "Cupcakes bake faster.", costs: [50, 110] },
  { id: "skates", name: "Roller Skates", desc: "Walk 35% faster.", costs: [40] },
  { id: "tray", name: "Serving Tray", desc: "Carry two cupcakes at once.", costs: [70] },
  { id: "fans", name: "Cooling Fans", desc: "Stations cool down twice as fast.", costs: [45] },
  { id: "chainSaver", name: "Streak Saver", desc: "Once per day, a lost customer won't break your streak.", costs: [80] },
  { id: "tipJar", name: "Tip Jar", desc: "+20% coins from every order.", costs: [60] },
  { id: "jukebox", name: "Jukebox", desc: "Customers wait 25% longer.", costs: [50] },
];

export const RULES = {
  baseOvenSlots: 2,
  // Seconds the baker is busy per action (long enough to see the close-up).
  actionTime: { flavor: 0.8, bake: 0.6, takeOut: 0.5, box: 1, serve: 0.7, cool: 1, store: 0.4, take: 0.4, trash: 0.5 },
    hotOvenBakeTimes: [7, 5.5, 4],
  burnGrace: 7,
  walkSpeed: 380,
  skatesMultiplier: 1.35,
  displaySlots: 2,
  heat: {
    bake: 0.12,
    turbo: 0.45,
    frost: 0.07,
    top: 0.05,
    box: 0.05,
    flavor: 0.04,
    serve: 0.03,
    store: 0.02,
    coolRate: 0.035,
    fanCoolRate: 0.07,
    coolAction: 0.7,
    unjamBelow: 0.35,
    cascadeDecay: 0.75,
  },
  chainStep: 3,
  maxChainLevel: 5,
  pointsPerCoin: 10,
  comboDiscoveryPoints: 300,
  chainReactionPoints: 150,
  perfectDayPoints: 500,
  surpriseMultiplier: 1.25,
  toGoBonus: 3,
};

// Five escalating days for a solo run.
export const DAYS = [
  { length: 90, spawnEvery: 10, patience: 55, surpriseChance: 0.25, comboChance: 0.2, toGoChance: 0, goal: 40 },
  { length: 100, spawnEvery: 8.5, patience: 48, surpriseChance: 0.25, comboChance: 0.3, toGoChance: 0.2, goal: 65 },
  { length: 105, spawnEvery: 7.5, patience: 44, surpriseChance: 0.2, comboChance: 0.4, toGoChance: 0.3, goal: 85 },
  { length: 110, spawnEvery: 6.5, patience: 40, surpriseChance: 0.2, comboChance: 0.5, toGoChance: 0.35, goal: 115 },
  { length: 120, spawnEvery: 5.8, patience: 36, surpriseChance: 0.2, comboChance: 0.55, toGoChance: 0.4, goal: 150 },
];

// Bake-Off (VS): one shared day, full menu, same customers for both players.
export const BAKE_OFF_DAY = { length: 100, spawnEvery: 7, patience: 44, surpriseChance: 0.2, comboChance: 0.45, toGoChance: 0.25, goal: 0 };
export const BAKE_OFF_BUDGET = 150;

export const CUSTOMER_NAMES = [
  "Ava", "Ben", "Cleo", "Dev", "Eli", "Fern", "Gus", "Hana", "Ivy", "Jae", "Kai", "Luz", "Milo", "Nia", "Omar", "Pip",
  "Quinn", "Rosa", "Sam", "Tess", "Uma", "Vic", "Wren", "Xander", "Yui", "Zed",
];
