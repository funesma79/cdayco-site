// Tests del comparador. Uso: node --test qa-remote/compare.test.mjs
// Integración opcional con un artefacto real: ARTIFACT_DIR=/ruta/a/resultados node --test qa-remote/compare.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluate, loadResults } from './compare.mjs';

const PAGE = '/en/event-design-production.html';
const FOCUS = 'A|Discuss an event';
const SEO = { pages: 42, linkOccurrences: 1018, brokenCount: 0, canonicalIssueCount: 3, hreflangIssueCount: 0 };

// Datos mínimos con cobertura completa: 15 casos B y 126 casos C (42 páginas × 3 anchos)
function make({ bFail = null, afterLast = null, candOcc = {}, baseOcc = {}, mutate = null } = {}) {
  const B = {};
  for (const p of ['/a.html', '/b.html', '/c.html', '/d.html', '/e.html', PAGE]) for (const w of [390, 820]) B[`${p}@${w}`] = { fails: [] };
  for (const i of [1, 2, 3]) B[`B_${i}.json:reduced-motion`] = { fails: [] };
  const Cc = {}, Cb = {};
  const pages = [PAGE, ...Array.from({ length: 41 }, (_, i) => `/p${i}.html`)];
  for (const p of pages) for (const w of [390, 820, 1440]) {
    const k = `${p}@${w}`;
    const baseSeq = w === 1440 ? ['A|logo', 'A|Inicio [NAV]', FOCUS] : ['A|logo', 'BUTTON|menu-toggle', 'A|Inicio [NAV]', FOCUS];
    const candSeq = w === 1440 ? baseSeq : baseSeq.filter(x => !x.endsWith(' [NAV]'));
    Cb[k] = { shotHash: 'h', seq: baseSeq, occluded: baseOcc[k] || [], maxSx: w === 1440 ? 0 : 262, errors: [], csp: [] };
    Cc[k] = { shotHash: 'h', seq: candSeq, occluded: candOcc[k] || [], maxSx: 0, errors: [], csp: [], quick: w === 1440 ? undefined : [], desktop: w === 1440 ? { toggleDisplay: 'none', vis: 'visible' } : undefined };
  }
  if (bFail) { B[`${PAGE}@390`] = { fails: [bFail], afterLast }; }
  const d = { B, Cc, Cb, seo: { candidate: { ...SEO }, baseline: { ...SEO } } };
  if (mutate) mutate(d);
  return d;
}
const occ = (active, occluder) => ({ active, inNav: false, occluder });
const K = `${PAGE}@390`;

test('caso limpio → PASS', () => {
  const r = evaluate(make());
  assert.equal(r.verdict, 'PASS'); assert.equal(r.findings.length, 0);
});

test('preexistente verificado (página, viewport, foco y elemento que tapa) → PREEXISTING y PASS, el hallazgo se sigue informando', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS} [tapado por #cda-consent]`, afterLast: { active: FOCUS, hit: false, occluder: '#cda-consent' },
    candOcc: { [K]: [occ(FOCUS, '#cda-consent')] }, baseOcc: { [K]: [occ(FOCUS, '#cda-consent')] }
  }));
  assert.equal(r.counts.PREEXISTING, 1); assert.equal(r.verdict, 'PASS');
  assert.match(r.findings[0].message, /foco tapado/);
});

test('regresión nueva: el baseline no tiene la oclusión → NEW y REVISAR', () => {
  const r = evaluate(make({ bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false, occluder: '#cda-consent' } }));
  assert.equal(r.counts.NEW, 1); assert.equal(r.verdict, 'REVISAR');
});

test('agravada: el mismo foco lo tapa ahora otro elemento → AGGRAVATED', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false, occluder: '#primary-nav' },
    baseOcc: { [K]: [occ(FOCUS, '#cda-consent')] }, candOcc: { [K]: [occ(FOCUS, '#cda-consent')] }
  }));
  assert.equal(r.counts.AGGRAVATED, 1); assert.equal(r.verdict, 'REVISAR');
});

test('agravada en C: más paradas tapadas que en el baseline → REVISAR', () => {
  const r = evaluate(make({ baseOcc: { [K]: [occ(FOCUS, '#cda-consent')] }, candOcc: { [K]: [occ(FOCUS, '#cda-consent'), occ('A|Exhibition design', '#cda-consent')] } }));
  assert.ok(r.counts.AGGRAVATED >= 1); assert.ok(r.counts.NEW >= 1); assert.equal(r.verdict, 'REVISAR');
});

test('coincidencia parcial (mismo elemento que tapa, distinto foco) no es PREEXISTING', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false, occluder: '#cda-consent' },
    baseOcc: { [K]: [occ('A|Otro enlace', '#cda-consent')] }, candOcc: { [K]: [occ('A|Otro enlace', '#cda-consent')] }
  }));
  assert.equal(r.counts.PREEXISTING, 0); assert.equal(r.counts.NEW, 1); assert.equal(r.verdict, 'REVISAR');
});

test('coincidencia en otro viewport no cuenta', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false, occluder: '#cda-consent' },
    baseOcc: { [`${PAGE}@820`]: [occ(FOCUS, '#cda-consent')] }, candOcc: { [`${PAGE}@820`]: [occ(FOCUS, '#cda-consent')] }
  }));
  assert.equal(r.counts.PREEXISTING, 0); assert.equal(r.verdict, 'REVISAR');
});

test('datos antiguos sin elemento que tapa (forma del run 38724820865) → UNVERIFIED y REVISAR', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false },
    mutate: d => { for (const k of Object.keys(d.Cb)) delete d.Cb[k].occluded; for (const k of Object.keys(d.Cc)) delete d.Cc[k].occluded; }
  }));
  assert.equal(r.counts.UNVERIFIED, 1); assert.equal(r.verdict, 'REVISAR');
});

test('baseline sin registro de oclusión aunque el candidato traiga el elemento que tapa → UNVERIFIED', () => {
  const r = evaluate(make({
    bFail: `foco tapado tras salir del menú: ${FOCUS}`, afterLast: { active: FOCUS, hit: false, occluder: '#cda-consent' },
    mutate: d => { delete d.Cb[K].occluded; }
  }));
  assert.equal(r.counts.UNVERIFIED, 1); assert.equal(r.verdict, 'REVISAR');
});

test('otros fallos de B (Escape) son siempre NEW', () => {
  const r = evaluate(make({ bFail: 'Escape desde enlace: [true,"true","visible","A|Inicio"]' }));
  assert.equal(r.counts.NEW, 1); assert.equal(r.verdict, 'REVISAR');
});

test('C: secuencia distinta o paradas en el menú cerrado → NEW', () => {
  const r = evaluate(make({ mutate: d => { d.Cc[`${PAGE}@390`].seq = ['A|logo', 'BUTTON|menu-toggle', 'A|Inicio [NAV]', FOCUS]; } }));
  assert.ok(r.counts.NEW >= 2); assert.equal(r.verdict, 'REVISAR');
});

test('C: error de consola presente igual en el baseline → PREEXISTING; error nuevo → NEW', () => {
  const pre = evaluate(make({ mutate: d => { d.Cc['/p0.html@390'].errors = ['x']; d.Cb['/p0.html@390'].errors = ['x']; } }));
  assert.equal(pre.counts.PREEXISTING, 1); assert.equal(pre.verdict, 'PASS');
  const neu = evaluate(make({ mutate: d => { d.Cc['/p0.html@390'].errors = ['y']; } }));
  assert.equal(neu.counts.NEW, 1); assert.equal(neu.verdict, 'REVISAR');
});

test('SEO distinto → NEW; cobertura incompleta → REVISAR', () => {
  assert.equal(evaluate(make({ mutate: d => { d.seo.candidate.brokenCount = 1; } })).verdict, 'REVISAR');
  assert.equal(evaluate(make({ mutate: d => { delete d.B['/a.html@390']; } })).verdict, 'REVISAR');
});

const ART = process.env.ARTIFACT_DIR;
test('integración: artefacto real del run 38724820865', { skip: !ART || !fs.existsSync(ART) }, () => {
  const r = evaluate(loadResults(ART));
  assert.equal(r.coverage.bCases, 15); assert.equal(r.coverage.cCases, 126);
  assert.equal(r.metrics.navStopsClosedMobile, 0); assert.equal(r.metrics.maxSx, 0); assert.equal(r.metrics.seoSame, true);
  // Único hallazgo: la oclusión del banner, sin datos para verificarla como preexistente
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].cls, 'UNVERIFIED'); assert.equal(r.findings[0].case, `${PAGE}@390`);
  assert.equal(r.verdict, 'REVISAR');
});
