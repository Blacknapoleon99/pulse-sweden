import test from 'node:test';
import assert from 'node:assert/strict';
import {readLaunchPreferences} from '../mobile/src/launchPreferences.ts';
import {createIntroPlayback} from '../mobile/src/launchPlayback.ts';

function deferred<T>() {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise,resolve};
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('a slow accessibility response defaults to animation after the loading budget', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const motion = deferred<boolean>(), preferences:boolean[] = [];
  const cancel = readLaunchPreferences({readMotion:()=>motion.promise,
    onMotion:value=>preferences.push(value)});
  assert.deepEqual(preferences,[]);
  t.mock.timers.tick(1500);
  assert.deepEqual(preferences,[false]);
  cancel();
});
test('a late real reduced-motion preference overrides the timeout fallback', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const motion = deferred<boolean>(), preferences:boolean[] = [];
  const cancel = readLaunchPreferences({readMotion:()=>motion.promise,
    onMotion:value=>preferences.push(value)});
  t.mock.timers.tick(1500);
  assert.deepEqual(preferences,[false]);
  motion.resolve(true); await flush();
  assert.deepEqual(preferences,[false,true]);
  cancel();
});
test('late motion callbacks stop after unmount', async () => {
  const motion = deferred<boolean>(), preferences:boolean[] = [];
  const cancel = readLaunchPreferences({readMotion:()=>motion.promise,
    onMotion:value=>preferences.push(value)});
  cancel(); motion.resolve(false); await flush();
  assert.deepEqual(preferences,[]);
});

test('waiting for the visible frame keeps playback paused and then rewinds to zero', () => {
  const calls:string[] = [];
  const player = {currentTime:3, pause:()=>calls.push('pause'),
    play:()=>calls.push(`play:${player.currentTime}`)};
  const playback = createIntroPlayback(player);
  playback.sync(false); // Downloaded, but still behind the splash or waiting for the decoded frame.
  playback.sync(false);
  assert.deepEqual(calls,['pause','pause']);
  playback.sync(true);
  assert.deepEqual(calls,['pause','pause','play:0']);
});

test('backgrounding pauses the intro and resuming preserves the remaining duration', () => {
  const calls:string[] = [];
  const player = {currentTime:0, pause:()=>calls.push('pause'),
    play:()=>calls.push(`play:${player.currentTime}`)};
  const playback = createIntroPlayback(player);
  playback.sync(true);
  player.currentTime = 3;
  playback.sync(false);
  playback.sync(true);
  assert.deepEqual(calls,['play:0','pause','play:3']);
});
