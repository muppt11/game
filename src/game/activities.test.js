import assert from 'node:assert/strict';
import { createActivityProgress, INGREDIENTS } from './activities.js';
import { createShift } from './shift.js';
import { DAYS, STARTING_MENU } from './data.js';

const progress = createActivityProgress('flavor:vanilla');
assert.equal(progress.advance(), false);
assert.equal(progress.collect('unknown'), false);
assert.equal(progress.collect('egg'), true);
assert.equal(progress.collect('egg'), false);
for (const id of INGREDIENTS.slice(1)) progress.collect(id);
assert.equal(progress.step, 1);
progress.advance(); progress.advance();
assert.equal(progress.step, 1);
progress.advance();
assert.equal(progress.step, 2);
assert.equal(progress.ready, false);
progress.advance();
assert.equal(progress.ready, true);
assert.equal(progress.advance(), false);
for (const [id, count] of [['bake', 1], ['turbo', 1], ['frost:chocolate', 3], ['top:cherry', 1], ['box', 3], ['serve:1:1', 1], ['top:candle', 1], ['top:heart', 1]]) {
  const task = createActivityProgress(id);
  for (let i = 0; i < count; i++) {
    assert.equal(task.ready, false);
    task.advance();
  }
  assert.equal(task.ready, true);
  assert.equal(task.advance(), false);
}
assert.equal(createActivityProgress('cool'), null);
assert.equal(createActivityProgress('takeOut'), null);
// Preparation is separate from inventory mutation: cancellation cannot grant food.
const shift = createShift({ day: DAYS[0], seed: 3, menu: STARTING_MENU });
assert.equal(shift.state.hands.length, 0);
assert.equal(shift.perform('cafeTable', 'flavor:vanilla'), true);
shift.tick(1);
assert.equal(shift.state.hands.length, 1);
assert.equal(shift.state.hands[0].flavor, 'vanilla');
console.log('Station activity progression and commit checks passed');

const batch = createActivityProgress('flavor:vanilla', 2);
for (const id of INGREDIENTS) batch.collect(id);
for (let i = 0; i < 3; i++) batch.advance();
batch.advance();
assert.equal(batch.ready, false, 'one pour cannot finish a two-cupcake batch');
batch.advance();
assert.equal(batch.ready, true);
assert.equal(batch.filled, 2);
