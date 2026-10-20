import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const host = process.argv[2] ?? 'https://t9rldv0-kevin200-8081.exp.direct';
const assets = ['cajklops-opening.mp4','cajklops-icon-loop.mp4',
  'cajklops-icon-poster.png','fonts/CinzelDecorative-Bold.ttf'];
const hash = data => createHash('sha256').update(data).digest('hex');
await Promise.all(['ios','android'].map(async platform => {
  const response = await fetch(host,{headers:{'expo-platform':platform,accept:'application/expo+json','expo-protocol-version':'0'}});
  assert.equal(response.status,200);
  const manifest = await response.json();
  assert.equal(manifest.extra.expoClient.name,'Cajklops');
  assert.equal(manifest.extra.expoGo.debuggerHost,new URL(host).host);
  const bundleResponse = await fetch(manifest.launchAsset.url);
  assert.equal(bundleResponse.status,200);
  const js = await bundleResponse.text();
  for (const token of ['createIntroPlayback','CajklopsDisplay','cachedCajklopsVideo','readLaunchPreferences'])
    assert.ok(js.includes(token),`${platform} missing ${token}`);
  console.log(`${platform}: updated bundle (${js.length} characters) on ${new URL(host).host}`);
  // Use the same metadata and URL construction as expo-asset on the phone.
  for (const asset of assets) {
    const name = asset.slice(asset.lastIndexOf('/')+1).replace(/\.[^.]+$/,'');
    const found = [...js.matchAll(/"httpServerLocation":\s*"([^"]+)"[\s\S]{0,500}?"hash":\s*"([^"]+)"[\s\S]{0,100}?"name":\s*"([^"]+)"[\s\S]{0,70}?"type":\s*"([^"]+)"/g)]
      .find(match => match[3] === name);
    assert.ok(found,`Metadata missing: ${asset}`);
    const url = new URL(`${found[1]}/${encodeURIComponent(name)}.${found[4]}`,host);
    url.searchParams.set('platform',platform); url.searchParams.set('hash',found[2]);
    const remote = await fetch(url);
    assert.equal(remote.status,200,`Asset request failed: ${url}`);
    const data = Buffer.from(await remote.arrayBuffer());
    const local = await readFile(new URL(`../../mobile/assets/${asset}`,import.meta.url));
    assert.equal(hash(data),hash(local),`Stale public ${platform} asset: ${asset}`);
    console.log(`${platform}: ${asset} matches local (${data.length} bytes)`);
  }
}));
