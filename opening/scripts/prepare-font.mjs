import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
const directory = fileURLToPath(new URL('../public/fonts/', import.meta.url));
const bytes = fs.readFileSync(path.join(directory, 'CinzelDecorative-Bold.ttf'));
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const scale = 1000 / font.unitsPerEm;
const n = value => Math.round(value * scale * 100) / 100;
const glyphs = {};
for (const letter of 'CAJKLOPS? ') {
  const glyph = font.charToGlyph(letter), outline = [];
  for (const c of glyph.path.commands) {
    if (c.type === 'M' || c.type === 'L') outline.push(c.type.toLowerCase(), n(c.x), n(c.y));
    if (c.type === 'Q') outline.push('q', n(c.x), n(c.y), n(c.x1), n(c.y1));
    if (c.type === 'C') outline.push('b', n(c.x), n(c.y), n(c.x1), n(c.y1), n(c.x2), n(c.y2));
  }
  glyphs[letter] = { ha: n(glyph.advanceWidth) + 28, x_min: n(glyph.xMin || 0), x_max: n(glyph.xMax || 0), o: outline.join(' ') };
}
fs.writeFileSync(path.join(directory, 'cinzel.typeface.json'), JSON.stringify({
  glyphs, familyName: 'Cinzel Decorative', resolution: 1000,
  ascender: n(font.ascender), descender: n(font.descender), underlinePosition: -100,
  underlineThickness: 50, boundingBox: { yMin: n(font.descender), yMax: n(font.ascender) },
  original_font_information: { source: 'Google Fonts / Cinzel Decorative', license: 'SIL OFL 1.1; see OFL.txt' },
}));
console.log('Prepared Cinzel Decorative 3D wordmark outlines.');
