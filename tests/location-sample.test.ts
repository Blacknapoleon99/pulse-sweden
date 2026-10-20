import test from 'node:test';
import assert from 'node:assert/strict';
import {locationPayload} from '../mobile/src/locationSample.ts';
test('location payload uses measured time and refuses stale, invalid or unconsented points',()=>{
  const now=Date.now(),sample={timestamp:now-45_000,coords:{latitude:59.33,longitude:18.06,accuracy:20}};
  assert.equal(locationPayload(sample,'active',now)?.observedAt,sample.timestamp);
  assert.equal(locationPayload(sample,'',now),null);
  assert.equal(locationPayload({...sample,timestamp:now-180_000},'active',now),null);
  assert.equal(locationPayload({...sample,timestamp:now+60_000},'active',now),null);
  assert.equal(locationPayload({...sample,coords:{...sample.coords,accuracy:null}},'active',now),null);
});
