import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

export async function renderIcon(serveUrl) {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const assets = path.resolve(project, '../mobile/assets');
  const chromiumOptions = {gl:'angle'};
  const composition = await selectComposition({serveUrl, id:'CajklopsIcon', chromiumOptions});
  await renderMedia({serveUrl, composition, codec:'h264', crf:18, pixelFormat:'yuv420p',
    outputLocation:path.join(assets,'cajklops-icon-loop.mp4'), concurrency:3, chromiumOptions,
    onProgress:({progress}) => { if (progress === 1) console.log('Icon loop rendered.'); }});
  await renderStill({serveUrl, composition, frame:0, imageFormat:'png', chromiumOptions,
    output:path.join(assets,'cajklops-icon-poster.png')});
  await mkdir(path.join(assets,'fonts'), {recursive:true});
  for (const file of ['CinzelDecorative-Bold.ttf','OFL.txt'])
    await copyFile(path.join(project,'public/fonts',file),path.join(assets,'fonts',file));
  console.log('Bundled animated icon, fallback, and Cajklops display font.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const serveUrl = await bundle({entryPoint:path.join(project,'src/index.ts'),publicDir:path.join(project,'public')});
  await renderIcon(serveUrl);
}
