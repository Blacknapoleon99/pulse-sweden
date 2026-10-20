import { createHmac, randomBytes } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';

const PROD_URL = 'https://appapi2.bankid.com';
const TEST_URL = 'https://appapi2.test.bankid.com';
const token = () => randomBytes(32).toString('base64url');

export function createBankIdAuth({ familyService, query } = {}) {
  const env = process.env.BANKID_ENV === 'production' ? 'production' : 'test';
  const baseUrl = env === 'production' ? PROD_URL : TEST_URL;
  const configured = Boolean(process.env.BANKID_CERT_PATH && process.env.BANKID_CERT_PASSPHRASE && process.env.BANKID_USER_HASH_KEY && familyService?.available && query);
  let pfxPromise;
  let caPromise;
  const readTlsFiles = async () => {
    pfxPromise ||= readFile(process.env.BANKID_CERT_PATH);
    if (process.env.BANKID_CA_CERT_PATH) caPromise ||= readFile(process.env.BANKID_CA_CERT_PATH);
    return { pfx: await pfxPromise, ...(caPromise ? { ca: await caPromise } : {}) };
  };
  async function rpCall(method, payload) {
    if (!configured) throw Object.assign(new Error('BankID kräver avtal, RP-certifikat och serverhemligheter'), { status: 503 });
    const tls = await readTlsFiles();
    const requestBody = Buffer.from(JSON.stringify(payload), 'utf8');
    return await new Promise((resolve, reject) => {
      const request = https.request(`${baseUrl}/rp/v6.0/${method}`, {
        method: 'POST',
        pfx: tls.pfx,
        ...(tls.ca ? { ca: tls.ca } : {}),
        passphrase: process.env.BANKID_CERT_PASSPHRASE,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': requestBody.length },
        timeout: 10_000,
      }, response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { raw += chunk; if (raw.length > 64_000) request.destroy(new Error('BankID response too large')); });
        response.on('end', () => {
          let body;
          try { body = JSON.parse(raw || '{}'); } catch { return reject(new Error('Ogiltigt svar från BankID')); }
          if ((response.statusCode || 500) >= 400) {
            const error = new Error('BankID kunde inte slutföra begäran');
            error.bankIdCode = body.errorCode;
            error.status = 502;
            return reject(error);
          }
          resolve(body);
        });
      });
      request.on('timeout', () => request.destroy(new Error('BankID svarade inte inom tidsgränsen')));
      request.on('error', reject);
      request.end(requestBody);
    });
  }
  function clientIp(req) {
    let address = req.socket?.remoteAddress || '';
    if (process.env.BANKID_TRUST_PROXY === 'true') {
      // Render routes public requests through Cloudflare. This single-value header
      // avoids trusting a client-supplied leftmost X-Forwarded-For entry.
      address = String(req.headers['cf-connecting-ip'] || '').trim();
    }
    if (address.startsWith('::ffff:')) address = address.slice(7);
    if (!isIP(address)) throw Object.assign(new Error('Kunde inte fastställa klientens IP-adress'), { status: 400 });
    return address;
  }
  async function init() {
    if (!query) return;
    await query(`CREATE TABLE IF NOT EXISTS bankid_orders (flow_hash text PRIMARY KEY, order_ref text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await query('CREATE INDEX IF NOT EXISTS bankid_orders_expiry ON bankid_orders(expires_at)');
  }
  async function start(req) {
    if (!configured) throw Object.assign(new Error('BankID är inte aktiverat. Servern behöver ett BankID-avtal, certifikat och nycklar.'), { status: 503 });
    const ip = clientIp(req);
    const visibleText = Buffer.from('Identifiera dig för att logga in eller skapa konto hos TryggPuls', 'utf8').toString('base64');
    const body = { endUserIp: ip, userVisibleData: visibleText };
    if (process.env.BANKID_RETURN_URL) {
      const returnUrl = new URL(process.env.BANKID_RETURN_URL);
      if (returnUrl.protocol !== 'https:') throw Object.assign(new Error('BankID return URL måste använda HTTPS'), { status: 503 });
      body.returnUrl = returnUrl.href;
    }
    const order = await rpCall('auth', body);
    if (!order.orderRef || !order.autoStartToken) throw Object.assign(new Error('BankID-svaret saknade orderuppgifter'), { status: 502 });
    const flowToken = token();
    try {
      await query('DELETE FROM bankid_orders WHERE expires_at<=now()');
      await query('INSERT INTO bankid_orders(flow_hash,order_ref,expires_at) VALUES($1,$2,now()+interval \'3 minutes\')', [createHmac('sha256', process.env.BANKID_USER_HASH_KEY).update(`flow-token:${flowToken}`).digest('hex'), order.orderRef]);
    } catch (error) {
      await rpCall('cancel', { orderRef: order.orderRef }).catch(() => {});
      throw error;
    }
    return { flowToken, autoStartToken: order.autoStartToken, expiresInSeconds: 180 };
  }
  async function collect(flowToken) {
    if (!configured) throw Object.assign(new Error('BankID är inte aktiverat på servern'), { status: 503 });
    if (typeof flowToken !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(flowToken)) throw Object.assign(new Error('BankID-sessionen är ogiltig eller har gått ut'), { status: 400 });
    const flowHash = createHmac('sha256', process.env.BANKID_USER_HASH_KEY).update(`flow-token:${flowToken}`).digest('hex');
    const row = (await query('SELECT order_ref FROM bankid_orders WHERE flow_hash=$1 AND expires_at>now()', [flowHash])).rows[0];
    if (!row) throw Object.assign(new Error('BankID-sessionen har gått ut. Starta om inloggningen.'), { status: 410 });
    const status = await rpCall('collect', { orderRef: row.order_ref });
    if (status.status === 'pending') return { status: 'pending', hintCode: status.hintCode };
    if (status.status === 'failed') {
      await query('DELETE FROM bankid_orders WHERE flow_hash=$1', [flowHash]);
      return { status: 'failed' };
    }
    if (status.status !== 'complete' || !status.completionData?.user?.personalNumber) throw Object.assign(new Error('BankID returnerade ett ofullständigt identitetsresultat'), { status: 502 });
    const consumed = (await query('DELETE FROM bankid_orders WHERE flow_hash=$1 AND expires_at>now() RETURNING flow_hash', [flowHash])).rows[0];
    if (!consumed) throw Object.assign(new Error('BankID-sessionen har redan använts'), { status: 409 });
    const identity = status.completionData.user;
    const subjectHash = createHmac('sha256', process.env.BANKID_USER_HASH_KEY).update(`bankid-subject:${identity.personalNumber}`).digest('hex');
    const displayName = String(identity.name || [identity.givenName, identity.surname].filter(Boolean).join(' ')).trim().slice(0, 80);
    const signedIn = await familyService.completeBankIdLogin(subjectHash, displayName || 'BankID-användare');
    return { status: 'complete', ...signedIn };
  }
  return { configured, environment: env, init, start, collect };
}
