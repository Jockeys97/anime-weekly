import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DubbingStatus } from '../components/DubbingStatus';
import { getDictionary } from '../lib/i18n';
import { locales } from '../lib/locales';
import type { DubbingResult } from '../lib/dubbing';
const render=(status:DubbingResult['status'], language:'it'|'en'='it')=>renderToStaticMarkup(React.createElement(DubbingStatus,{malId:123,locale:language,initial:{status,language,malId:123,checkedAt:'2026-10-16T00:00:00Z'}}));
it('uses a qualified report, exact MAL link and attribution without claiming provider audio',()=>{
 const html=render('reported'); expect(html).toContain('Doppiaggio segnalato'); expect(html).toContain('Italiano');
 expect(html).toContain('https://myanimelist.net/anime/123'); expect(html).toContain('https://mydublist.com'); expect(html).toContain('va verificata separatamente');
 expect(html).not.toContain('Netflix');
});
it('shows missing data as unverified and preserves partial status',()=>{
 expect(render('unverified')).toContain('Non verificato'); expect(render('unverified')).toContain('non significa che non esista');
 expect(render('partial')).toContain('Doppiaggio parziale segnalato');
 const html=renderToStaticMarkup(React.createElement(DubbingStatus,{locale:'it'})); expect(html).toContain('Non verificato'); expect(html).toContain('ID MAL verificato per questa stagione precisa');
});

it('never presents unknown, missing-identity or pending results as an Italian audio track', () => {
 const unknown=render('unverified');
 expect(unknown).toContain('Lingua cercata'); expect(unknown).not.toContain('dubbing-flag');
 expect(unknown).not.toContain('>Audio<'); expect(unknown).toContain('Non verificato');
 const missing=renderToStaticMarkup(React.createElement(DubbingStatus,{locale:'it'}));
 const pending=renderToStaticMarkup(React.createElement(DubbingStatus,{locale:'it',malId:123}));
 expect(missing).not.toContain('dubbing-flag'); expect(pending).not.toContain('dubbing-flag');
 expect(pending).toContain('Lingua cercata'); expect(pending).toContain('Verifica');
});

it.each(locales)('reserves flags for actual full or partial reports in %s', language => {
 for(const status of ['reported','partial','unverified'] as const){
  const html=renderToStaticMarkup(React.createElement(DubbingStatus,{locale:language,malId:123,initial:{status,language,malId:123,checkedAt:'2026-10-16T00:00:00Z'}}));
  if(status==='unverified') expect(html).not.toContain('dubbing-flag');
  else expect(html).toContain(`data-language="${language}"`);
 }
});
it('does not show a cached Italian report after the requested language changes',()=>{
 const html=renderToStaticMarkup(React.createElement(DubbingStatus,{malId:123,locale:'en',initial:{status:'reported',language:'it',malId:123}}));
 expect(html).toContain('Checking'); expect(html).not.toContain('Dub reported');
});
it.each(locales)('has complete localized dubbing labels for %s',locale=>{
 expect(Object.keys(getDictionary(locale).dubbing).sort()).toEqual(Object.keys(getDictionary('en').dubbing).sort());
 expect(Object.values(getDictionary(locale).dubbing).every(value=>value.length>0)).toBe(true);
});

it('keeps list and detail reports compact with native keyboard-accessible disclosure', () => {
 const html=render('reported');
 expect(html).toContain('<details>'); expect(html).toContain('<summary class="dubbing-summary"');
 expect(html).not.toContain('<details open'); expect(html).toContain('dubbing-flag');
 expect(html).toContain('dubbing-badge'); expect(html).toContain('Segnalato');
 expect(html.indexOf('dubbing-details')).toBeGreaterThan(html.indexOf('</summary>'));
 expect(html).toContain('Consultato il'); expect(html).toContain('Voce MAL precisa');
});
