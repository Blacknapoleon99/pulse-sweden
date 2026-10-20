import test from 'node:test';
import assert from 'node:assert/strict';
import {articleIntro,articleUrl} from '../mobile/src/articleTeaser.ts';

test('preview preserves the exact publisher article URL including live-news entry',()=>{
  const url='https://www.aftonbladet.se/nyheter/a/example/artikel?pinnedEntry=123&utm_medium=rss';
  assert.equal(articleUrl({title:'Nyhet',url,source:'https://www.aftonbladet.se/'}),url);
  assert.equal(articleUrl({title:'Nyhet',source:'https://www.expressen.se/nyheter/sverige/artikel/'}),'https://www.expressen.se/nyheter/sverige/artikel/');
  assert.equal(articleUrl({title:'Nyhet',url:'javascript:alert(1)'}),null);
  assert.equal(articleUrl({title:'Nyhet',url:'https://user:password@example.com'}),null);
});

test('preview uses the feed introduction and bounds long content without cutting a word',()=>{
  assert.equal(articleIntro({title:'Nyhet',summary:'<p>Artikelns början.</p>\n<p>Mer information.</p>'}),'Artikelns början. Mer information.');
  const summary='Det här är artikelns inledning. '.repeat(40),preview=articleIntro({title:'Nyhet',summary});
  assert.ok(preview.length<=421);assert.ok(preview.endsWith('…'));
  assert.equal(summary.startsWith(preview.slice(0,-1)),true);
  assert.equal(articleIntro({title:'Utan inledning'}),'');
});
