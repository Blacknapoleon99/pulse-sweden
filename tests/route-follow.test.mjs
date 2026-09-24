import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteFollowController } from '../route-follow.js';

function fakeLocation() {
  const watches = new Map(), cleared = [], intervals = new Map(), clearedIntervals = [];
  let nextWatch = 0, nextInterval = 0;
  return {
    watches, cleared, intervals, clearedIntervals,
    geolocation: {
      watchPosition(success, error, options) {
        const id = ++nextWatch;
        watches.set(id, { success, error, options });
        return id;
      },
      clearWatch(id) { cleared.push(id); watches.delete(id); }
    },
    setIntervalFn(callback, ms) { const id = ++nextInterval; intervals.set(id, { callback, ms }); return id; },
    clearIntervalFn(id) { clearedIntervals.push(id); intervals.delete(id); }
  };
}

test('route follow pauses GPS off-screen, resumes once, and stop clears GPS and refresh timer', () => {
  const fake = fakeLocation();
  let visible = true, positions = 0, refreshes = 0, errors = 0;
  const controller = createRouteFollowController({
    geolocation: fake.geolocation, isVisible: () => visible,
    onPosition: () => positions++, onError: () => errors++, onRefresh: () => refreshes++,
    setIntervalFn: fake.setIntervalFn, clearIntervalFn: fake.clearIntervalFn
  });
  assert.equal(controller.start(), true);
  assert.equal(controller.start(), false);
  assert.equal(fake.watches.size, 1);
  assert.equal(fake.intervals.size, 1);
  assert.equal(fake.intervals.values().next().value.ms, 60_000);
  const firstWatch = fake.watches.get(1);
  firstWatch.success({ coords: { latitude: 59, longitude: 18 }, timestamp: 1 });
  assert.equal(positions, 1);
  firstWatch.error({ code: 2, message: 'temporarily unavailable' });
  assert.equal(errors, 1);
  assert.equal(controller.active, true);
  fake.intervals.values().next().value.callback();
  assert.equal(refreshes, 1);

  visible = false;
  controller.pause();
  assert.equal(fake.watches.size, 0);
  assert.equal(fake.intervals.size, 0);
  firstWatch.success({ coords: { latitude: 59, longitude: 18 }, timestamp: 2 });
  assert.equal(positions, 1, 'late GPS callbacks after pause are ignored');

  visible = true;
  assert.equal(controller.resume(), true);
  assert.equal(fake.watches.size, 1);
  assert.equal(fake.intervals.size, 1);
  const stoppedTimerCallback = fake.intervals.values().next().value.callback;
  assert.equal(controller.stop('user'), true);
  assert.equal(controller.active, false);
  assert.equal(controller.watching, false);
  assert.equal(controller.refreshing, false);
  assert.equal(fake.watches.size, 0);
  assert.equal(fake.intervals.size, 0);
  stoppedTimerCallback();
  assert.equal(refreshes, 1);
});

test('GPS permission denial stops watching and prevents timed source refreshes', () => {
  const fake = fakeLocation();
  const stateChanges = [], errors = [];
  const controller = createRouteFollowController({
    geolocation: fake.geolocation,
    onError: error => errors.push(error.code),
    onActiveChange: (active, reason) => stateChanges.push([active, reason]),
    setIntervalFn: fake.setIntervalFn, clearIntervalFn: fake.clearIntervalFn
  });
  controller.start();
  fake.watches.get(1).error({ code: 1, message: 'denied' });
  assert.deepEqual(errors, [1]);
  assert.equal(controller.active, false);
  assert.equal(fake.watches.size, 0);
  assert.equal(fake.intervals.size, 0);
  assert.deepEqual(stateChanges, [[true, 'start'], [false, 'permission-denied']]);
});
