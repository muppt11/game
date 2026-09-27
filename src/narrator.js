// Optional voice narrator built on the Web Speech API (no dependencies).
// If the browser has no speechSynthesis, everything here is a no-op and the
// toggle stays hidden.

const NARRATOR_KEY = "tanvis-code-bakery-narrator";

export const narratorSupported = typeof window !== "undefined"
  && "speechSynthesis" in window
  && "SpeechSynthesisUtterance" in window;

const synth = narratorSupported ? window.speechSynthesis : null;

function readEnabled() {
  try {
    return localStorage.getItem(NARRATOR_KEY) === "on";
  } catch {
    return false;
  }
}

let enabled = narratorSupported && readEnabled();
let voice = null;
let currentUtterance = null;
let pendingTimer = null;

// Voices load asynchronously in Chrome; pick an English one once they arrive
// so we never speak with an empty/unsupported default voice.
function chooseVoice() {
  const voices = synth.getVoices();
  voice = voices.find((v) => v.lang?.startsWith("en") && v.default)
    ?? voices.find((v) => v.lang === "en-US" && v.localService)
    ?? voices.find((v) => v.lang?.startsWith("en"))
    ?? null;
}

if (narratorSupported) {
  chooseVoice();
  synth.addEventListener?.("voiceschanged", chooseVoice);
}

export function isNarratorEnabled() {
  return enabled;
}

export function setNarratorEnabled(value) {
  if (!narratorSupported) return;
  enabled = Boolean(value);
  try {
    localStorage.setItem(NARRATOR_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable - the choice just won't survive a reload.
  }
  if (!enabled) {
    window.clearTimeout(pendingTimer);
    synth.cancel();
    currentUtterance = null;
  }
}

export function toggleNarrator() {
  setNarratorEnabled(!enabled);
  return enabled;
}

function say(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 1.05;
  utterance.volume = 1;
  utterance.onend = utterance.onerror = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };
  // Hold a reference: Chrome can garbage-collect an in-flight utterance and go silent.
  currentUtterance = utterance;
  // Chrome sometimes leaves the queue paused (e.g. after the tab was hidden).
  synth.resume();
  synth.speak(utterance);
}

// Speaks one short line, cutting off whatever was being said so utterances
// never pile up or overlap.
export function speak(text) {
  if (!narratorSupported || !enabled || !text) return;
  window.clearTimeout(pendingTimer);
  const line = String(text).replace(/\s+/g, " ").trim();
  if (synth.speaking || synth.pending) {
    synth.cancel();
    // Give the engine a beat to flush the cancel; some browsers drop an
    // utterance queued in the same tick.
    pendingTimer = window.setTimeout(() => say(line), 60);
  } else {
    say(line);
  }
}

// Browsers (Safari especially) only allow speech that starts from a user
// gesture. When the narrator was left on from a previous visit, the first
// click or key press speaks a silent primer to unlock later narration.
if (narratorSupported) {
  const unlock = () => {
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    if (!enabled || synth.speaking || synth.pending) return;
    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0;
    synth.speak(primer);
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}
