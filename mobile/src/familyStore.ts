import type { FamilyAlarm, FamilyMessage, FamilyOverview } from './api';
import {updateFamilyTrails,type FamilyTrails} from './familyTrails.ts';

type Snapshot = { overview: FamilyOverview | null; trails:FamilyTrails; alarms: FamilyAlarm[]; messages: FamilyMessage[]; loading: boolean; error: string; alarmError:string;chatError:string; revision: number };
type Request = <T>(path: string, method?: string, value?: unknown) => Promise<T>;
export function createFamilyStore(request: Request, token: () => Promise<string | null>) {
  let snapshot: Snapshot = { overview: null, trails:{}, alarms: [], messages: [], loading: true, error: '',alarmError:'',chatError:'', revision: 0 };
  let epoch = 0, credential: string | null = null, active: Promise<boolean> | null = null;
  const acknowledged = new Set<string>();
  const listeners = new Set<() => void>();
  const publish = (update: Partial<Snapshot>) => { snapshot = { ...snapshot, ...update }; listeners.forEach(fn => fn()); };
  function reset() {
    epoch++; active = null; credential = null; acknowledged.clear();
    publish({ overview: null, trails:{}, alarms: [], messages: [], loading: false, error: '',alarmError:'',chatError:'', revision: snapshot.revision + 1 });
  }
  async function refresh(chat = false): Promise<boolean> {
    if (active) return active;
    const currentEpoch = epoch;
    const work = (async () => {
      try {
        const session = await token();
        if (currentEpoch !== epoch) return false;
        if (!session) {
          if (credential || snapshot.overview) reset();
          else if (snapshot.loading) publish({ loading: false });
          return true;
        }
        if (credential && credential !== session) { reset(); return false; }
        credential = session;
        const overview = await request<FamilyOverview>('me');
        if (currentEpoch !== epoch || session !== await token()) return false;
        if (snapshot.overview?.family?.id !== overview.family?.id || snapshot.overview?.user.id !== overview.user.id) {
          acknowledged.clear();
          publish({ overview, trails:updateFamilyTrails({},overview.members,Date.now(),overview.positionHistory), alarms: [], messages: [],alarmError:'',chatError:'', revision: snapshot.revision + 1 });
        } else publish({ overview, trails:updateFamilyTrails(snapshot.trails,overview.members,Date.now(),overview.positionHistory),error:'' });
        const [alarmResult, chatResult] = await Promise.allSettled([
          overview.family ? request<{ alarms: FamilyAlarm[] }>('alarms').then(result=>{if(!Array.isArray(result.alarms))throw new Error('Servern skickade ett ogiltigt larmsvar.');return result;}) : Promise.resolve({ alarms: [] }),
          chat && overview.family ? request<{ messages: FamilyMessage[] }>('messages').then(result=>{if(!Array.isArray(result.messages))throw new Error('Servern skickade ett ogiltigt chattsvar.');return result;}) : Promise.resolve(null),
        ]);
        if (currentEpoch !== epoch || session !== await token()) return false;
        if ([alarmResult,chatResult].some(result=>result.status==='rejected'&&(result.reason as {status?:number}).status===401)) {
          reset();publish({error:'Din inloggning har gått ut. Logga in igen.'});return false;
        }
        if (alarmResult.status === 'fulfilled') publish({ alarms: alarmResult.value.alarms.map(a => acknowledged.has(a.id) ? { ...a, recipients: a.recipients.map(r => r.id === overview.user.id ? { ...r, acknowledgedAt: r.acknowledgedAt || new Date().toISOString() } : r) } : a) });
        if (chatResult.status === 'fulfilled' && chatResult.value) publish({ messages: chatResult.value.messages });
        const describe=(label:string,error:unknown)=>`${label} kunde inte uppdateras${(error as {status?:number})?.status?` (${(error as {status:number}).status})`:''}. ${error instanceof Error?error.message:'Försök igen.'}`;
        publish({ loading: false, error:'',alarmError:alarmResult.status==='rejected'?describe('Familjelarm',alarmResult.reason):'',chatError:chatResult.status==='rejected'?describe('Familjechatten',chatResult.reason):chat?'':snapshot.chatError });
        return true;
      } catch (error) {
        if (currentEpoch !== epoch) return false;
        const status=(error as {status?:number}).status;
        if (status === 401) reset();
        publish({ loading: false, error: status===401?'Din inloggning har gått ut. Logga in igen.':`Familjens platser kunde inte uppdateras${status?` (${status})`:''}. ${error instanceof Error?error.message:'Försök igen.'}` });
        return false;
      }
    })();
    active = work;
    try { return await work; } finally { if (active === work) active = null; }
  }
  async function acknowledge(id: string) {
    const currentEpoch = epoch, familyId = snapshot.overview?.family?.id;
    await request(`alarms/${id}/acknowledge`, 'POST', {});
    if (currentEpoch !== epoch || familyId !== snapshot.overview?.family?.id) return;
    acknowledged.add(id);
    publish({ alarms: snapshot.alarms.map(a => a.id === id ? { ...a, recipients: a.recipients.map(r => r.id === snapshot.overview?.user.id ? { ...r, acknowledgedAt: new Date().toISOString() } : r) } : a) });
  }
  return { getSnapshot: () => snapshot, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, reset, refresh, acknowledge };
}
