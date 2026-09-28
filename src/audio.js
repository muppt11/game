// Background music, sound effects, and the music volume controls.

import { clamp } from "./utils";
import backgroundMusicUrl from "../audio/maksymmalko-funny-cartoon-music-532611.mp3?url";
import plopSoundUrl from "../audio/freesound_community-water-splash-80537.mp3?url";
import ovenBellUrl from "../audio/dragon-studio-bell-ring-390294.mp3?url";
import whooshUrl from "../audio/dragon-studio-simple-whoosh-382724.mp3?url";
import popUrl from "../audio/universfield-bubble-pop-06-351337.mp3?url";
import levelUpUrl from "../audio/universfield-level-up-05-326133.mp3?url";
import gameStartUrl from "../audio/freesound_community-086354_8-bit-arcade-video-game-start-sound-effect-gun-reload-and-jump-81124.mp3?url";
import awwUrl from "../audio/adhimahadi-aww-8277.mp3?url";
import shineUrl from "../audio/faith_mulato-shine-193240.mp3?url";
import sprinkleUrl from "../audio/freesound_community-salt-shakingwav-14556.mp3?url";
import boxUrl from "../audio/oxidvideos-placing-cardboard-box-453025.mp3?url";
import eatingUrl from "../audio/betoelguapillo-cartoon-eating-sound-effect-427528.mp3?url";
import slimyUrl from "../audio/freesound_community-slimy-77623.mp3?url";
import buttonPressedUrl from "../audio/freesound_community-button-pressed-38129.mp3?url";
import characterOptionUrl from "../audio/dragon-studio-button-press-382713.mp3?url";
import clickUrl from "../audio/matthewvakaliuk73627-mouse-click-290204.mp3?url";

const VOLUME_KEY = "tanvis-code-bakery-volume";

const effects = {
  plop: { url: plopSoundUrl, volume: 0.8 },
  bell: { url: ovenBellUrl, volume: 1 },
  whoosh: { url: whooshUrl, volume: 0.8 },
  pop: { url: popUrl, volume: 1 },
  levelUp: { url: levelUpUrl, volume: 1 },
  gameStart: { url: gameStartUrl, volume: 0.9 },
  aww: { url: awwUrl, volume: 0.9 },
  shine: { url: shineUrl, volume: 0.9 },
  sprinkles: { url: sprinkleUrl, volume: 1, duration: 500 },
  box: { url: boxUrl, volume: 1 },
  eating: { url: eatingUrl, volume: 1, startAt: 0.5, duration: 1200 },
  mix: { url: slimyUrl, volume: 0.7, duration: 700 },
  confirm: { url: buttonPressedUrl, volume: 1 },
  characterOption: { url: characterOptionUrl, volume: 1 },
  click: { url: clickUrl, volume: 1 },
};
for (const effect of Object.values(effects)) {
  effect.audio = new Audio(effect.url);
  effect.audio.preload = "auto";
}

let musicEnabled = true;
let musicVolume = 0.25;
try {
  const saved = localStorage.getItem(VOLUME_KEY);
  if (saved !== null && Number.isFinite(Number(saved))) musicVolume = clamp(Number(saved), 0, 0.5);
} catch {
  // Keep the default volume.
}

export function playSound(name) {
  const effect = effects[name];
  if (!musicEnabled || !effect) return;
  const sound = effect.audio.cloneNode();
  sound.volume = effect.volume;
  if (effect.startAt) sound.currentTime = effect.startAt;
  sound.play().catch(() => {});
  if (effect.duration) window.setTimeout(() => sound.pause(), effect.duration);
}

export function setupAudio({ music, controls, toggle, down, up }) {
  music.src = backgroundMusicUrl;
  music.volume = musicVolume;
  let expanded = false;

  function render() {
    toggle.textContent = musicEnabled ? `♫ ${Math.round(musicVolume * 100)}%` : "♫ Off";
    toggle.setAttribute("aria-pressed", String(musicEnabled));
    toggle.setAttribute("aria-label", expanded ? (musicEnabled ? "Mute background music" : "Play background music") : "Show music controls");
    down.disabled = musicVolume <= 0;
    up.disabled = musicVolume >= 0.5;
  }

  const play = () => {
    if (!musicEnabled || !music.paused) return;
    music.play().catch(() => {});
  };

  function setExpanded(value) {
    expanded = value;
    controls.classList.toggle("is-expanded", value);
    toggle.setAttribute("aria-expanded", String(value));
    render();
  }

  function adjust(change) {
    musicVolume = clamp(Math.round((musicVolume + change) * 100) / 100, 0, 0.5);
    music.volume = musicVolume;
    try {
      localStorage.setItem(VOLUME_KEY, String(musicVolume));
    } catch {
      // Not persisted.
    }
    if (!musicEnabled) {
      musicEnabled = true;
      play();
    }
    render();
  }

  toggle.addEventListener("click", () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    musicEnabled = !musicEnabled;
    if (musicEnabled) play();
    else music.pause();
    render();
  });
  down.addEventListener("click", () => adjust(-0.1));
  up.addEventListener("click", () => adjust(0.1));
  document.addEventListener("click", (event) => {
    if (expanded && !controls.contains(event.target)) setExpanded(false);
  });
  // Browsers only allow audio after the first interaction.
  const unlock = () => {
    play();
    if (!music.paused) {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    }
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) play();
  });
  render();
  return { play };
}
