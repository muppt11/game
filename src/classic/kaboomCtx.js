import kaboom from "kaboom";

export const k = kaboom({
  canvas: document.querySelector("#game-canvas"),
  width: 960,
  height: 540,
  stretch: true,
  letterbox: true,
  crisp: true,
  background: [248, 237, 216],
  global: false,
});