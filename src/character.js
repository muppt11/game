// The player's baker: appearance options, saving, and the customizer dialog.

const CHARACTER_KEY = "tanvis-code-bakery-character";
const DEFAULT_CHARACTER = { name: "", style: "girl", hair: "brown", skin: "peach", eyes: "brown", shirt: "yellow" };
const CHARACTER_OPTIONS = {
  style: [["girl", "Girl", "#e98f9d"], ["boy", "Boy", "#7695a8"]],
  hair: [["brown", "Cocoa", "#623f36"], ["black", "Night", "#3b2520"], ["pink", "Berry", "#bd5656"], ["gold", "Honey", "#f2cf83"]],
  skin: [["peach", "Peach", "#f2c4a8"], ["warm", "Warm", "#c98262"], ["deep", "Deep", "#7c4b3a"], ["golden", "Golden", "#e0a477"]],
  eyes: [["brown", "Cocoa", "#51342f"], ["green", "Sage", "#87966f"], ["blue", "Sky", "#7695a8"], ["black", "Black", "#2b1b1b"]],
  shirt: [["yellow", "Honey", "#f2cf83"], ["pink", "Berry", "#e98f9d"], ["blue", "Sky", "#7695a8"], ["sage", "Sage", "#87966f"]],
};
const CHARACTER_LABELS = { style: "Character style", hair: "Hair color", skin: "Skin color", eyes: "Eye color", shirt: "Shirt color" };

function readCharacter() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHARACTER_KEY) ?? "{}");
    if (saved.eyes === "pink") saved.eyes = "black";
    if (saved.shirt === "cream") saved.shirt = "yellow";
    return { ...DEFAULT_CHARACTER, ...saved };
  } catch {
    return { ...DEFAULT_CHARACTER };
  }
}

function saveCharacter(character) {
  try {
    localStorage.setItem(CHARACTER_KEY, JSON.stringify(character));
  } catch {
    // Storage unavailable - the look just won't persist.
  }
}

const selectedColor = (type, value) => CHARACTER_OPTIONS[type].find(([id]) => id === value)?.[2] ?? CHARACTER_OPTIONS[type][0][2];

let character = readCharacter();

// Resolved colors and shapes, ready for the Kaboom scene.
export function getCharacterLook() {
  return {
    name: character.name.trim(),
    skin: selectedColor("skin", character.skin),
    hair: selectedColor("hair", character.hair),
    eyes: selectedColor("eyes", character.eyes),
    shirt: selectedColor("shirt", character.shirt),
    hairShape: character.style === "boy" ? { width: 34, height: 20, y: -17 } : { width: 40, height: 52, y: -7 },
  };
}

export function setupCharacterDialog({ dialog, openButtons, closeButton, options, preview, nameInput, defaultButton, saveButton, playSound, onChange }) {
  let draft = { ...character };

  function render() {
    nameInput.value = draft.name;
    preview.dataset.style = draft.style;
    preview.style.setProperty("--avatar-hair", selectedColor("hair", draft.hair));
    preview.style.setProperty("--avatar-skin", selectedColor("skin", draft.skin));
    preview.style.setProperty("--avatar-eyes", selectedColor("eyes", draft.eyes));
    preview.style.setProperty("--avatar-shirt", selectedColor("shirt", draft.shirt));
    options.innerHTML = Object.entries(CHARACTER_OPTIONS).map(([type, choices]) => `
      <fieldset class="character-group"><legend>${CHARACTER_LABELS[type]}</legend><div class="swatch-row">
        ${choices.map(([id, label, color]) => `<button class="color-swatch ${draft[type] === id ? "is-selected" : ""}" type="button" data-character-type="${type}" data-character-value="${id}" style="--swatch-color:${color}" aria-label="${label} ${type}" aria-pressed="${draft[type] === id}"><span></span></button>`).join("")}
      </div></fieldset>`).join("");
  }

  const open = () => {
    playSound("whoosh");
    draft = { ...character };
    render();
    dialog.showModal();
    closeButton.focus();
  };
  openButtons.forEach((button) => button.addEventListener("click", open));
  nameInput.addEventListener("input", () => {
    draft.name = nameInput.value;
  });
  options.addEventListener("click", (event) => {
    const swatch = event.target.closest("button[data-character-type]");
    if (!swatch) return;
    const changed = draft[swatch.dataset.characterType] !== swatch.dataset.characterValue;
    draft[swatch.dataset.characterType] = swatch.dataset.characterValue;
    render();
    if (changed) playSound("characterOption");
  });
  defaultButton.addEventListener("click", () => {
    draft = { ...DEFAULT_CHARACTER };
    render();
    playSound("characterOption");
  });
  saveButton.addEventListener("click", () => {
    character = { ...draft };
    saveCharacter(character);
    playSound("shine");
    dialog.close();
    onChange?.();
  });
  closeButton.addEventListener("click", () => dialog.close());
}
