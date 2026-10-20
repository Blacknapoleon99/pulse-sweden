export function communityPublishingAllowed(env=process.env) {
  if(env.COMMUNITY_PUBLISHING_ENABLED!=='true')return false;
  if(env.NODE_ENV!=='production')return true;
  let staff=[];try{staff=JSON.parse(env.ZONE_ADMIN_TOKENS_JSON||'[]');if(!Array.isArray(staff))return false;}catch{return false;}
  return env.COMMUNITY_LAUNCH_APPROVED==='true'&&env.MODERATION_STAFFED==='true'&&
    /^https:\/\//.test(env.PUBLIC_APP_URL||'')&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL||'')&&
    !!env.MODERATION_EMAIL&&(env.ZONE_ADMIN_TOKEN?.length>=32||staff.some(person=>person&&['reviewer','admin'].includes(person.role)&&typeof person.id==='string'&&/^[a-z0-9_-]{1,64}$/i.test(person.id)&&typeof person.token==='string'&&person.token.length>=24));
}
