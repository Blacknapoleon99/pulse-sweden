import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { renderIcon } from './render-icon.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const nativeAssets = path.resolve(project, '../mobile/assets');
await mkdir(nativeAssets, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(project, 'src/index.ts'), publicDir: path.join(project, 'public') });
const chromiumOptions = { gl: 'angle' };
await renderIcon(serveUrl);
const composition = await selectComposition({ serveUrl, id: 'CajklopsOpening', chromiumOptions });
const video = path.join(nativeAssets, 'cajklops-opening.mp4');
const poster = path.join(nativeAssets, 'cajklops-poster.png');
await renderMedia({ serveUrl, composition, codec: 'h264', crf: 20, pixelFormat: 'yuv420p',
  outputLocation: video, concurrency: 3, chromiumOptions });
const everyday = await selectComposition({serveUrl, id:'CajklopsEveryday', chromiumOptions});
await renderMedia({serveUrl, composition:everyday, codec:'h264', crf:20, pixelFormat:'yuv420p',
  outputLocation:path.join(nativeAssets,'cajklops-everyday.mp4'), concurrency:3, chromiumOptions});
await renderStill({ serveUrl, composition, frame: 130, imageFormat: 'png', output: poster, chromiumOptions });
const icon = path.join(nativeAssets, 'cajklops-icon.png');
await sharp(path.join(nativeAssets,'cajklops-icon-poster.png')).resize(720,720)
  .extend({top:152,bottom:152,left:152,right:152,background:'#E8F2FF'}).png().toFile(icon);
console.log('Rendered cartoon opening, poster, and static app icon for mobile. Web assets are separate.');
