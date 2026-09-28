// Hands-on station tasks use the current shift's chosen recipe and inventory.
// They prepare an action; only confirmation commits it through shift.perform.
import { FLAVORS, FROSTINGS, TOPPINGS, describeCupcake, stationById } from './data.js';
import { hintFor, targetFor } from './shift.js';
import { escapeHtml } from './ui.js';

export const INGREDIENTS = ['egg', 'butter', 'flour', 'sugar'];
const STEPS = {
  flavor: ['Gather ingredients', 'Mix the batter', 'Fill the cupcake liner'],
  bake: ['Load the oven'], turbo: ['Load the turbo oven'],
  frost: ['Pipe the first swirl', 'Pipe the second swirl', 'Pipe the top swirl'],
  serve: ['Send order down the belt'],
  top: ['Add the topping'], box: ['Place cupcake in box', 'Close the lid', 'Tie the ribbon'],
};

export function createActivityProgress(actionId, count = 1) {
  const kind = actionId.split(':')[0];
  if (!STEPS[kind]) return null;
  const ingredients = new Set();
  let step = 0;
  let stirs = 0;
  let filled = 0;
  return {
    kind, ingredients,
    get step() { return step; },
    get filled() { return filled; },
    get stirs() { return stirs; },
    get ready() { return step === STEPS[kind].length; },
    get label() { return STEPS[kind][step] ?? 'Ready!'; },
    collect(id) {
      if (kind !== 'flavor' || step !== 0 || !INGREDIENTS.includes(id) || ingredients.has(id)) return false;
      ingredients.add(id);
      if (ingredients.size === INGREDIENTS.length) step = 1;
      return true;
    },
    advance() {
      if (step >= STEPS[kind].length || (kind === 'flavor' && step === 0)) return false;
      if (kind === 'flavor' && step === 1 && ++stirs < 3) return true;
      if (kind === 'flavor' && step === 2 && ++filled < count) return true;
      step += 1;
      return true;
    },
  };
}

export function createStationActivities({ host, onCommit, onNavigate, sound }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-dialog station-activity-dialog';
  dialog.setAttribute('aria-labelledby', 'activity-title');
  host.append(dialog);
  let task = null;

  const color = (entry) => document.body.dataset.palette === 'colorblind' ? entry?.cbColor ?? entry?.color : entry?.color;
  function bowColor(id) {
    return document.body.dataset.palette === 'colorblind' ? { berry: '#0072b2', sage: '#009e73', gold: '#e69f00' }[id] : { berry: '#bd5656', sage: '#87966f', gold: '#d4a84f' }[id];
  }
  function nextStation() {
    const { progress: p, item, shift } = task;
    if (p.kind === 'flavor') return 'oven';
    const projected = p.kind === 'frost' ? { ...item, frosting: task.value } : p.kind === 'top' ? { ...item, topping: task.value } : item;
    const customer = targetFor(projected, shift.state.customers);
    if (p.kind === 'frost' && customer?.order?.topping !== 'none' && customer?.order) return 'decoratingCounter';
    if (p.kind !== 'box' && customer?.toGo && !item.boxed) return 'deliveryStation';
    return 'bakeryDoor';
  }
  function cupcake(item, swirls = item?.frosting ? 3 : 0, topping = item?.topping, shower = false) {
    return `<div class="cupcake-placeholder activity-cupcake ${topping && !['cherry', 'candle', 'heart'].includes(topping) ? 'has-sprinkles' : ''}" data-decoration="${['cherry', 'candle', 'heart'].includes(topping) ? topping : 'none'}" style="--cake-color:${color(FLAVORS[item?.flavor]) ?? '#e8cf8f'};--frosting-color:${color(FROSTINGS[item?.frosting]) ?? '#fbf1d6'};--frosting-border:#6f4436;--topping-color:${color(TOPPINGS[topping]) ?? '#e98f9d'}">
      <span class="cupcake-wrapper"></span><span class="cupcake-top"></span>
      ${['one', 'two', 'three'].map((id, i) => `<span class="frosting-swirl swirl-${id} ${i < swirls ? 'is-visible' : ''}"></span>`).join('')}
      <span class="cupcake-decoration"></span>${shower && ['sprinkles', 'shavings', 'gold'].includes(topping) ? Array.from({ length: 12 }, (_, i) => `<span class="sprinkle-shower-piece" aria-hidden="true" style="--sprinkle-x:${20 + i * 9}px;--sprinkle-color:${color(TOPPINGS[topping])};--sprinkle-duration:650ms;--sprinkle-delay:${i * 25}ms;--sprinkle-drift:${i % 2 ? 12 : -12}px;--sprinkle-fall:90px;--sprinkle-turn:${i * 35}deg"></span>`).join('') : ''}</div>`;
  }
  function workspace() {
    const { progress: p, item, value } = task;
    if (p.kind === 'flavor') {
      return `${p.step === 0 && p.ingredients.size === 0 ? `<fieldset class="batch-picker"><legend>How many cupcakes?</legend>${Array.from({ length: task.maxCount }, (_, i) => `<button type="button" data-count="${i + 1}" aria-pressed="${task.count === i + 1}">${i + 1}</button>`).join('')}</fieldset>` : `<p class="batch-note">Making ${task.count} cupcake${task.count > 1 ? 's' : ''}</p>`}<div class="batter-workspace">
        <div class="batter-ingredients">${INGREDIENTS.map(id => `<button type="button" class="batter-ingredient ${p.ingredients.has(id) ? 'is-added' : ''}" data-ingredient="${id}" draggable="true" ${p.ingredients.has(id) ? 'disabled' : ''}><span class="ingredient-icon ingredient-${id}" aria-hidden="true"></span>${id[0].toUpperCase() + id.slice(1)} ${p.ingredients.has(id) ? '✓' : ''}</button>`).join('')}</div>
        <div class="mixing-bowl ${p.step >= 2 ? 'is-mixed' : ''}" data-bowl aria-label="Drop ingredients into the mixing bowl"><span class="bowl-fill"></span>${INGREDIENTS.map(id => `<span class="batter-pixel batter-pixel-${id} ${p.ingredients.has(id) && p.step < 2 ? 'is-visible' : ''}"></span>`).join('')}<span class="spoon-tool ${p.step >= 1 ? 'is-visible' : ''} ${p.stirs ? 'is-whisking' : ''}"></span><span class="bowl-rim"></span></div>
      </div>
      ${p.step >= 2 ? `<div class="tray-interaction station-tray" style="--batter-color:${color(FLAVORS[value])};--batter-edge:#6f4436"><div class="tray-workspace">
        <button type="button" class="batter-dispenser ${p.ready ? 'has-dispensed is-dispensing' : ''}" data-step ${p.ready ? 'disabled' : ''} aria-label="Dispense batter into the cupcake liner"><span class="dispenser-tank" aria-hidden="true"></span><span class="dispenser-nozzle" aria-hidden="true"></span><span class="dispenser-click-cue" aria-hidden="true"></span><strong>${p.ready ? 'Filled ✓' : 'Dispense'}</strong></button>
        <div class="project-tray" aria-label="${p.filled} of ${task.count} liners filled">${Array.from({ length: 4 }, (_, i) => `<span class="tray-cup ${i < p.filled ? 'is-filled' : ''} ${i >= task.count ? 'spare-cup' : ''}" aria-hidden="true"></span>`).join('')}</div>
      </div><p class="tray-feedback">${p.ready ? `${task.count} cupcake${task.count > 1 ? 's' : ''} ready for the oven.` : `Click Dispense: ${p.filled} of ${task.count} filled.`}</p></div>` : ''}`;
    }
    if (p.kind === 'bake' || p.kind === 'turbo') {
      return `<div class="baking-interaction station-baking ${p.ready ? 'is-loaded' : ''}" style="--batter-color:${color(FLAVORS[item.flavor])};--batter-edge:#6f4436">
        <div class="baking-workspace"><div class="activity-oven" data-oven aria-label="Oven: ${p.ready ? 'tray loaded' : 'drop tray here'}"><span class="oven-control control-one"></span><span class="oven-control control-two"></span><span class="oven-window"></span><span class="oven-rack"></span></div>
        <div class="oven-tray" draggable="${!p.ready}" data-tray aria-label="Tray with ${task.count} cupcakes">${Array.from({ length: 4 }, (_, i) => `<span class="oven-cup ${i >= task.count ? 'spare-cup' : ''}"></span>`).join('')}</div></div>
        <p class="baking-feedback">${p.ready ? 'Tray loaded. Press Start baking to switch on the oven.' : 'Drag the filled tray into the oven, or use the button below.'}</p></div>`;
    }
    if (p.kind === 'serve') return `<div class="serving-interaction ${task.mode === 'serving' ? 'is-delivering' : ''}" style="--bow-color:${bowColor(item?.bowColor ?? 'berry')}"><div class="serving-scene">
      <div class="customer-speech">Thank you!</div><div class="serving-customer" aria-label="Your customer"><span class="customer-hair"></span><span class="customer-face"><i></i><i></i></span><span class="customer-body"></span></div>
      ${item ? `<div class="serving-package ${item.boxed ? '' : 'unboxed-order'}">${item.boxed ? '<span class="serving-ribbon ribbon-v"></span><span class="serving-ribbon ribbon-h"></span><span class="serving-bow serving-bow-left"></span><span class="serving-bow serving-bow-right"></span><span class="serving-bow-knot"></span>' : cupcake(item)}</div>` : ''}
      <div class="conveyor-belt"><span class="belt-surface"></span><span class="belt-leg leg-left"></span><span class="belt-leg leg-right"></span></div></div></div>`;
    if (p.kind === 'box') return `<div class="packaging-interaction activity-package ${p.step >= 2 ? 'is-packed' : ''} ${p.ready ? 'is-complete' : ''} ${item.topping === 'sprinkles' ? 'has-sprinkles' : ''}" data-package-step="${p.step}" data-bow="${task.bow}" data-decoration="${['cherry', 'candle', 'heart'].includes(item.topping) ? item.topping : 'none'}" style="--bow-color:${bowColor(task.bow)};--frosting-color:${color(FROSTINGS[item.frosting])};--frosting-border:#6f4436">
      <fieldset class="bow-picker"><legend>Ribbon color (optional)</legend><div>${['berry', 'sage', 'gold'].map(id => `<button type="button" data-bow-choice="${id}" aria-pressed="${task.bow === id}" class="${task.bow === id ? 'is-selected' : ''}"><span class="bow-swatch bow-${id}"></span>${id}</button>`).join('')}</div></fieldset>
      <div class="package-scene"><div class="package-box"><div class="package-cupcakes" ${p.step === 0 ? 'hidden' : ''}><span><span class="package-frosting"><b></b><b></b><b></b></span><i></i></span></div><span class="package-lid"></span><span class="package-ribbon ribbon-vertical"></span><span class="package-ribbon ribbon-horizontal"></span><span class="package-bow bow-left"></span><span class="package-bow bow-right"></span><span class="package-bow-knot"></span></div><div class="ribbon-preview is-visible"><small>RIBBON PREVIEW</small><span class="ribbon-preview-box"><i></i></span></div></div>
      <p class="packaging-feedback">${p.step === 0 ? 'Empty box' : p.step === 1 ? 'Cupcake inside ✓' : p.step === 2 ? 'Lid closed ✓' : 'Ribbon tied ✓'}</p></div>`;
    const frosted = p.kind === 'frost' ? { ...item, frosting: value } : item;
    return `<div class="activity-decorating ${p.kind === 'frost' ? 'is-frosting' : ''}">${p.kind === 'frost' ? `<button type="button" class="activity-piping-bag ${p.step ? 'has-piped' : ''}" data-step ${p.ready ? 'disabled' : ''} aria-label="${p.ready ? 'Frosting complete' : p.label}" style="--icing-color:${color(FROSTINGS[value])}"><svg viewBox="0 0 120 130" aria-hidden="true"><g stroke="#6f4436" stroke-width="4" stroke-linejoin="round"><path d="M73 22 67 7 85 12 99 5 103 22 91 32Z" fill="#fff8e8"/><path d="M75 29C48 26 20 48 22 69L53 105C76 94 101 62 92 36Z" fill="var(--icing-color)"/><path d="M72 36Q44 39 34 64" fill="none" stroke="#fff8e8" stroke-width="6"/><path d="M25 76 14 104 28 117 51 100Z" fill="#c5d2d7"/><path d="m14 104-7 17 10 5 11-9Z" fill="#8c9aa3"/><path d="m76 25 19 9-3 9-19-9Z" fill="#e69f00"/></g></svg></button>` : ''}${cupcake(frosted, p.kind === 'frost' ? p.step : 3, p.kind === 'top' && p.ready ? value : item?.topping, p.kind === 'top' && p.ready)}${p.kind === 'frost' ? `<div class="frosting-meter" role="progressbar" aria-label="Frosting swirls" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${p.step}"><span style="width:${p.step / 3 * 100}%"></span></div><p class="frosting-feedback">${p.step} of 3 swirls</p>` : ''}</div>`;
  }
  function render() {
    const { progress: p, action, stationId, item, value } = task;
    const title = p.kind === 'flavor' ? `${FLAVORS[value].name} batter` : action.label;
    const instruction = p.ready ? 'Ready! Use the button below to finish and move on.' : p.kind === 'flavor' && p.step === 0 ? 'Click each ingredient, or drag it into the bowl.' : p.kind === 'flavor' && p.step === 1 ? `Stir the bowl three times (${p.stirs}/3).` : p.label + '.';
    const label = p.kind === 'flavor' ? (p.step === 1 ? `Stir the batter (${p.stirs}/3)` : 'Dispense into liner') : p.kind === 'top' ? `Add ${TOPPINGS[value].name}` : p.label;
    dialog.innerHTML = `<div class="dialog-paper game-paper activity-paper"><button type="button" class="dialog-close" data-cancel aria-label="Close station and return to kitchen">×</button><p class="dialog-kicker">${escapeHtml(stationById(stationId).title)} · HANDS-ON</p><h2 id="activity-title">${escapeHtml(title)}</h2><p class="activity-clock"></p><button type="button" class="oven-rescue" data-oven-rescue hidden>Oven ready — collect cupcakes</button>${orderReminder()}<p class="activity-instruction" role="status">${escapeHtml(instruction)}</p><div class="activity-workspace">${workspace()}</div><div class="activity-controls">${!p.ready && !(p.kind === 'flavor' && (p.step === 0 || p.step === 2)) ? `<button type="button" class="whisk-button" data-step>${escapeHtml(label)}</button>` : ''}<button type="button" class="start-button" data-confirm ${p.ready ? '' : 'hidden'}>${p.kind === 'flavor' ? 'Take batter → Oven' : p.kind === 'frost' ? 'Finish frosting → Next station' : p.kind === 'top' ? 'Finish topping → Next station' : p.kind === 'box' ? 'Take box → Serving' : 'Start baking'}</button><button type="button" class="default-button" data-cancel>Back to kitchen</button></div></div>`;
    update();
  }
  function orderReminder() {
    const customer = task.progress.kind === 'serve' ? task.shift.state.customers.find(c => String(c.id) === task.value) : targetFor(task.item, task.shift.state.customers);
    if (!customer) return '';
    const order = customer.order;
    return `<p class="activity-order">${escapeHtml(customer.name)}: ${order ? `${FLAVORS[order.flavor].name} cake · ${FROSTINGS[order.frosting].name} frosting · ${TOPPINGS[order.topping].name}` : 'Any frosted cupcake'}${customer.toGo ? ' · Box to go' : ''}</p>`;
  }
  function servingSignature(shift, actions) {
    return JSON.stringify([!!shift.state.busy, shift.state.customers.map(customer => customer.id),
      shift.state.oven.map(slot => slot?.item.stage),
      actions.map(({ id, enabled, reason }) => [id, enabled, reason])]);
  }
  function renderServing() {
    const hadFocus = dialog.contains(document.activeElement);
    const focusedAction = document.activeElement?.dataset.servingAction;
    const focusedClose = document.activeElement?.classList.contains('dialog-close');
    const { shift } = task;
    const actions = shift.stationActions('bakeryDoor');
    const ready = actions.find(action => action.enabled && action.id.startsWith('serve:'));
    task.item = ready ? shift.state.hands.find(item => String(item.id) === ready.id.split(':')[2]) : null;
    task.value = ready?.id.split(':')[1];
    task.signature = servingSignature(shift, actions);
    const hint = ready ? 'Choose a customer below to send their cupcake along the belt.' : shift.state.jammed.has('bakeryDoor') ? 'The belt overheated. Cool it down below, then serve your order.' : hintFor(shift.state.hands[0], shift.state.customers, shift.state.oven);
    dialog.innerHTML = `<div class="dialog-paper game-paper activity-paper"><button type="button" class="dialog-close" data-cancel aria-label="Close station and return to kitchen">×</button><p class="dialog-kicker">SERVING</p><h2 id="activity-title">The serving belt</h2><p class="activity-clock"></p><button type="button" class="oven-rescue" data-oven-rescue hidden>Oven ready — collect cupcakes</button>${orderReminder()}<p class="activity-instruction" role="status">${escapeHtml(hint)}</p>${workspace()}<div class="activity-controls serving-choices">${actions.filter(action => action.id !== 'noMatch').map(action => `<button type="button" class="${action.id.startsWith('serve:') ? 'start-button' : 'default-button'}" data-serving-action="${escapeHtml(action.id)}" ${action.enabled && !shift.state.busy ? '' : 'disabled'}>${escapeHtml(action.label)}${action.id.startsWith('serve:') ? ` → Send down belt<small>${escapeHtml(describeCupcake(shift.state.hands.find(item => String(item.id) === action.id.split(':')[2])))}</small>` : ''}</button>`).join('')}<button type="button" class="default-button" data-cancel>Back to kitchen</button></div></div>`;
    if (hadFocus) {
      const previous = focusedAction && dialog.querySelector(`[data-serving-action="${CSS.escape(focusedAction)}"]:not(:disabled)`);
      (previous || dialog.querySelector(focusedClose ? '.dialog-close' : '.activity-controls [data-cancel]')).focus({ preventScroll: true });
    }
  }
  function openServing(shift) {
    if (task || shift.state.busy || shift.state.ended) return false;
    task = { shift, stationId: 'bakeryDoor', progress: createActivityProgress('serve'), mode: 'serve-select' };
    renderServing();
    dialog.showModal();
    update();
    (dialog.querySelector('[data-serving-action]:not(:disabled)') ?? dialog.querySelector('.activity-controls [data-cancel]')).focus();
    return true;
  }
  function renderLive(mode) {
    task.mode = mode;
    if (mode === 'serving') task.deliveryStarted = task.shift.state.time;
    dialog.innerHTML = `<div class="dialog-paper game-paper activity-paper"><button type="button" class="dialog-close" data-cancel aria-label="Close station and return to kitchen">×</button><p class="dialog-kicker">${mode === 'oven' ? 'OVEN' : 'SERVING'}</p><h2 id="activity-title">${mode === 'oven' ? 'Bake your cupcake' : 'Deliver the order'}</h2><p class="activity-clock"></p><button type="button" class="oven-rescue" data-oven-rescue hidden>Oven ready — collect cupcakes</button><p class="activity-instruction" role="status"></p>${workspace()}${mode === 'oven' ? '<div class="bake-progress" role="progressbar" aria-label="Baking progress" aria-valuemin="0" aria-valuemax="100"><span></span></div><button class="start-button" type="button" data-collect disabled>Loading oven…</button>' : '<button class="start-button" type="button" data-next-order hidden>Next customer → Ingredients</button>'}<button class="default-button" type="button" data-cancel>Back to kitchen</button></div>`;
    update();
    dialog.querySelector('.default-button[data-cancel]').focus({ preventScroll: true });
  }
  function stop() {
    task = null;
    dialog.close();
  }
  function update() {
    if (!task) return;
    const { shift } = task;
    if (task.mode === 'serve-select') {
      const actions = shift.stationActions('bakeryDoor');
      const signature = servingSignature(shift, actions);
      if (signature !== task.signature) renderServing();
    }
    const beltScene = dialog.querySelector('.serving-scene');
    if (beltScene) beltScene.style.setProperty('--delivery-distance', `${Math.max(0, beltScene.clientWidth - 130)}px`);
    const seconds = Math.max(0, Math.ceil(shift.state.length - shift.state.clock));
    const clock = dialog.querySelector('.activity-clock');
    const text = shift.state.hold ? 'Guided order · clock and patience paused' : `Shift: ${seconds}s remaining · customers are waiting`;
    if (clock.textContent !== text) clock.textContent = text;
    dialog.querySelector('[data-oven-rescue]').hidden = task.mode === 'oven' || !!shift.state.busy || !shift.state.oven.some(slot => slot?.item.stage === 'baked');
    if (task.mode === 'oven') {
      const slot = shift.state.oven.find(entry => entry?.item.id === task.item.id);
      const button = dialog.querySelector('[data-collect]');
      const view = dialog.querySelector('.station-baking');
      const ready = slot && ['baked', 'burnt'].includes(slot.item.stage);
      const progress = slot ? Math.min(100, Math.max(0, (shift.state.time - slot.startedAt) / slot.duration * 100)) : 0;
      view.classList.toggle('is-baking', slot?.item.stage === 'baking');
      view.classList.toggle('is-baked', slot?.item.stage === 'baked');
      dialog.querySelector('.bake-progress span').style.width = `${progress}%`;
      dialog.querySelector('.bake-progress').setAttribute('aria-valuenow', String(Math.round(progress)));
      button.hidden = !ready;
      button.disabled = !ready || !!shift.state.busy || shift.state.hands.length >= shift.state.handCapacity;
      button.textContent = ready ? (slot.item.stage === 'burnt' ? 'Take out burnt cupcake' : 'Collect ready cupcakes → Frosting') : 'Baking…';
      dialog.querySelector('.activity-instruction').textContent = !slot && !shift.state.busy ? 'The oven could not start. Return to the kitchen and check station heat.' : slot?.item.stage === 'burnt' ? 'It burned. Take it out, then toss it at Ingredients.' : ready ? (button.disabled ? 'Free a hand at the Display Case, then collect your cupcake.' : 'Ding! Your cupcake is ready — take it out.') : slot ? `Baking: ${Math.max(0, Math.ceil(slot.duration - (shift.state.time - slot.startedAt)))} seconds left.` : 'Putting the tray in…';
      const feedback = dialog.querySelector('.baking-feedback');
      feedback.textContent = 'The oven keeps baking if you return to the kitchen.';
    }
    if (task.mode === 'serving') {
      const delivered = !shift.state.hands.some(item => item.id === task.item.id);
      const travelling = shift.state.time - task.deliveryStarted < 1.8 && (delivered || !!shift.state.busy);
      const view = dialog.querySelector('.serving-interaction');
      view.classList.toggle('is-delivering', travelling);
      view.classList.toggle('is-delivered', delivered && !travelling);
      const next = dialog.querySelector('[data-next-order]');
      next.hidden = !delivered || travelling;
      next.textContent = shift.state.hands.length ? 'Continue with held cupcakes →' : 'Next customer → Ingredients';
      dialog.querySelector('.activity-instruction').textContent = travelling ? 'Sending the order down the belt…' : delivered ? 'Order delivered! Ready for the next customer.' : 'The customer left or the station jammed. Your cupcake is still in your hands.';
    }

  }
  function change(ingredient) {
    if (!task) return;
    const p = task.progress;
    const changed = ingredient ? p.collect(ingredient) : p.advance();
    if (!changed) return;
    sound(ingredient ? 'plop' : p.kind === 'flavor' ? 'mix' : p.kind === 'box' ? 'box' : p.kind === 'top' ? 'sprinkles' : 'pop');
    render();
    (dialog.querySelector('[data-step]:not(:disabled)') ?? dialog.querySelector('[data-ingredient]:not(:disabled)') ?? dialog.querySelector('[data-confirm]'))?.focus();
  }
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!task || !button || button.disabled) return;
    if (button.hasAttribute('data-cancel')) return stop();
    if (button.hasAttribute('data-next-order')) {
      const shift = task.shift;
      stop();
      if (shift.stationActions('bakeryDoor').some(action => action.enabled && action.id.startsWith('serve:'))) openServing(shift);
      else if (!shift.state.hands.length) onNavigate('cafeTable');
      return;
    }
    if (button.dataset.servingAction) {
      const id = button.dataset.servingAction;
      const action = task.shift.stationActions('bakeryDoor').find(entry => entry.id === id && entry.enabled);
      if (!action) return;
      if (id.startsWith('serve:')) {
        task.action = action;
        task.value = id.split(':')[1];
        task.item = task.shift.state.hands.find(item => String(item.id) === id.split(':')[2]);
        if (onCommit('bakeryDoor', id)) renderLive('serving');
      } else if (onCommit('bakeryDoor', id)) update();
      return;
    }

    if (button.hasAttribute('data-oven-rescue')) {
      stop();
      onNavigate('oven');
      return;
    }
    if (button.dataset.count) {
      task.count = Number(button.dataset.count);
      task.progress = createActivityProgress(task.action.id, task.count);
      render();
      dialog.querySelector(`[data-count="${task.count}"]`)?.focus();
      return;
    }
    if (button.dataset.ingredient) return change(button.dataset.ingredient);
    if (button.dataset.bowChoice) {
      task.bow = button.dataset.bowChoice;
      render();
      dialog.querySelector(`[data-bow-choice="${task.bow}"]`)?.focus();
      return;
    }
    if (button.hasAttribute('data-collect')) {
      const next = task.item.stage === 'burnt' ? 'cafeTable' : 'frostingCounter';
      const pickup = task.shift.stationActions('oven').find(action => action.itemId === task.item.id);
      const readyCount = task.shift.state.oven.filter(slot => slot && ['baked', 'burnt'].includes(slot.item.stage)).length;
      if (pickup && onCommit('oven', readyCount > 1 ? 'takeAll' : pickup.id, next)) stop();
      return;
    }
    if (button.hasAttribute('data-step')) {
      if (task.progress.kind === 'serve') {
        if (onCommit(task.stationId, task.action.id)) renderLive('serving');
        return;
      }
      return change();
    }
    if (button.hasAttribute('data-confirm') && task.progress.ready) {
      const { stationId, action, progress, item, bow } = task;
      if (progress.kind === 'bake' || progress.kind === 'turbo') {
        if (onCommit(stationId, action.id)) renderLive('oven');
        return;
      }
      if (onCommit(stationId, action.id, nextStation(), { count: progress.kind === 'flavor' ? task.count : 1 })) {
        if (progress.kind === 'box') item.bowColor = bow;
        stop();
      }
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); stop(); });
  dialog.addEventListener('dragstart', event => {
    const ingredient = event.target.closest('[data-ingredient]');
    if (ingredient && !ingredient.disabled) event.dataTransfer.setData('text/plain', ingredient.dataset.ingredient);
    else if (event.target.closest('[data-tray]')) event.dataTransfer.setData('text/plain', 'tray');
  });
  dialog.addEventListener('dragover', event => {
    if (event.target.closest('[data-bowl], [data-oven]')) event.preventDefault();
  });
  dialog.addEventListener('drop', event => {
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (event.target.closest('[data-bowl]') && INGREDIENTS.includes(value)) change(value);
    if (event.target.closest('[data-oven]') && value === 'tray') change();
  });
  return {
    get active() { return task !== null; }, stop, update, openServing,
    start(shift, stationId, actionId) {
      if (task || shift.state.busy || shift.state.ended) return false;
      const progress = createActivityProgress(actionId);
      const action = shift.stationActions(stationId).find(entry => entry.id === actionId && entry.enabled);
      if (!progress || !action) return false;
      const value = actionId.split(':')[1];
      const item = progress.kind === 'flavor' ? { flavor: value } : shift.state.hands.find(held =>
        progress.kind === 'serve' ? String(held.id) === actionId.split(':')[2] :
        progress.kind === 'bake' || progress.kind === 'turbo' ? held.stage === 'raw' :
        progress.kind === 'frost' ? held.stage === 'baked' && !held.frosting :
        held.stage === 'baked' && held.frosting && (progress.kind === 'top' ? !held.topping : !held.boxed));
      if (!item) return false;
      const maxCount = Math.min(4, shift.state.handCapacity - shift.state.hands.length);
      const count = ['bake', 'turbo'].includes(progress.kind) ? Math.min(shift.state.hands.filter(held => held.stage === 'raw').length, shift.state.oven.filter(slot => !slot).length) : 1;
      task = { shift, stationId, action, value, item, progress, maxCount, count, bow: item.bowColor ?? 'berry', mode: 'prepare' };
      render();
      dialog.showModal();
      (dialog.querySelector('[data-ingredient]') ?? dialog.querySelector('[data-step]:not(:disabled)'))?.focus();
      return true;
    },
  };
}
