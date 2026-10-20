const path = require('node:path');
const ngrok = require('@expo/ngrok');
const {NgrokClient, NgrokClientError} = require('@expo/ngrok/src/client');

// Keep the ngrok agent's JSON error body so its normal "not ready" retry works.
// The bundled got transport can otherwise mask this with an undefined-body error.
// This changes only the local agent API transport, not tunnel authentication.
NgrokClient.prototype.request = async function(method, endpoint, options = {}) {
  const url = new URL(endpoint, `${ngrok.getUrl()}/`);
  if (method === 'get') {
    for (const [key, value] of Object.entries(options)) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: method.toUpperCase(),
    ...(method !== 'get' ? {headers: {'content-type': 'application/json'}, body: JSON.stringify(options)} : {}),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = {msg: text}; }
  if (!response.ok) {
    throw new NgrokClientError(body.msg, {statusCode: response.status, body: text}, body);
  }
  return body;
};

const entry = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli');
process.argv = [process.execPath, entry, 'start', '--go', ...process.argv.slice(2)];
require(entry);
