import test from 'node:test';
import assert from 'node:assert/strict';
import {communityPublishingAllowed} from '../release-config.mjs';
test('production publication requires explicit owner flags and configured moderation/support',()=>{
  const env={NODE_ENV:'production',COMMUNITY_PUBLISHING_ENABLED:'true',COMMUNITY_LAUNCH_APPROVED:'true',MODERATION_STAFFED:'true',PUBLIC_APP_URL:'https://example.test',SUPPORT_EMAIL:'support@example.test',MODERATION_EMAIL:'moderation@example.test',ZONE_ADMIN_TOKENS_JSON:JSON.stringify([{id:'reviewer',role:'reviewer',token:'synthetic-role-token-long-123'}])};assert.equal(communityPublishingAllowed(env),true);
  for(const key of ['COMMUNITY_PUBLISHING_ENABLED','COMMUNITY_LAUNCH_APPROVED','MODERATION_STAFFED','PUBLIC_APP_URL','SUPPORT_EMAIL','MODERATION_EMAIL','ZONE_ADMIN_TOKENS_JSON'])assert.equal(communityPublishingAllowed({...env,[key]:''}),false,key);
  assert.equal(communityPublishingAllowed({...env,ZONE_ADMIN_TOKENS_JSON:'{}'}),false);assert.equal(communityPublishingAllowed({...env,ZONE_ADMIN_TOKENS_JSON:'[null]'}),false);assert.equal(communityPublishingAllowed({NODE_ENV:'development',COMMUNITY_PUBLISHING_ENABLED:'true'}),true);
});
