// Compara los resultados de run-remote.mjs con el baseline y clasifica cada hallazgo.
// Uso: node qa-remote/compare.mjs [dirResultados] [--out fichero.json]
//   código de salida 0 = PASS, 1 = REVISAR
//
// Clases de hallazgo:
//   PREEXISTING — coincidencia verificada con el baseline en página, viewport, elemento enfocado y elemento que lo tapa
//   AGGRAVATED  — el mismo elemento ya estaba tapado en el baseline, pero ahora lo tapa otro elemento, o hay más paradas tapadas
//   NEW         — no existe en el baseline (regresión)
//   UNVERIFIED  — faltan datos para verificar la coincidencia (no cuenta como preexistente)
// Solo PREEXISTING deja pasar el veredicto; el hallazgo se sigue informando.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OCCLUSION_MSG = 'foco tapado tras salir del menú';
const key = (o) => `${o.active}\u0000${o.occluder}`;

// Paradas tapadas fuera del menú (las del menú abierto no existen en el baseline)
const occludedOutsideNav = (rec) => (rec && Array.isArray(rec.occluded)) ? rec.occluded.filter(o => !o.inNav) : null;

export function classifyOcclusion(caseKey, focused, occluder, Cb) {
  const ev = { case: caseKey, focused, occluder };
  if (!occluder) return { cls: 'UNVERIFIED', reason: 'el resultado del candidato no registra el elemento que tapa', ev };
  const base = occludedOutsideNav(Cb[caseKey]);
  if (!base) return { cls: 'UNVERIFIED', reason: 'no hay registro de oclusión del baseline para esta página y viewport', ev };
  if (base.some(o => o.active === focused && o.occluder === occluder)) return { cls: 'PREEXISTING', reason: 'el baseline tiene la misma oclusión (página, viewport, elemento enfocado y elemento que tapa)', ev };
  const same = base.find(o => o.active === focused);
  if (same) return { cls: 'AGGRAVATED', reason: `en el baseline lo tapaba ${same.occluder}; ahora ${occluder}`, ev };
  return { cls: 'NEW', reason: 'el baseline no tiene esa oclusión', ev };
}

export function evaluate({ B = {}, Cc = {}, Cb = {}, seo = {}, memory = null }) {
  const findings = [];
  const add = (cls, phase, c, message, reason, ev) => findings.push({ cls, phase, case: c, message, reason, evidence: ev || null });

  // Fase B: solo el candidato. La oclusión se verifica contra el registro del baseline en la fase C.
  for (const [k, v] of Object.entries(B)) for (const msg of (v.fails || [])) {
    if (msg.startsWith(OCCLUSION_MSG)) {
      const focused = v.afterLast?.active ?? msg.slice(OCCLUSION_MSG.length + 2).replace(/ \[tapado por .*\]$/, '');
      const r = classifyOcclusion(k, focused, v.afterLast?.occluder ?? null, Cb);
      add(r.cls, 'B', k, msg, r.reason, r.ev);
    } else add('NEW', 'B', k, msg, 'fallo de fase B sin equivalente en el baseline');
  }
  const bCases = Object.keys(B).length;

  // Fase C: candidato frente a baseline
  let cCases = 0, navStops = 0, maxSx = 0, shotDiff = 0, occlusionData = 0;
  for (const [k, c] of Object.entries(Cc)) {
    cCases++; const b = Cb[k]; const w = k.split('@')[1];
    maxSx = Math.max(maxSx, c.maxSx || 0);
    if (w !== '1440') navStops += (c.seq || []).filter(x => x.endsWith('[NAV]')).length;
    if (!b) { add('UNVERIFIED', 'C', k, 'sin registro del baseline', 'falta el caso en el baseline'); continue; }
    const expected = w === '1440' ? b.seq : b.seq.filter(x => !x.endsWith(' [NAV]'));
    if (JSON.stringify(c.seq) !== JSON.stringify(expected)) add('NEW', 'C', k, 'la secuencia de Tab difiere del baseline (sin paradas del menú cerrado)', 'regla de secuencia');
    if (c.shotHash !== b.shotHash) shotDiff++;
    const baseErr = new Set([...(b.errors || []), ...(b.quickErrors || [])]);
    for (const e of [...(c.errors || []), ...(c.quickErrors || [])]) add(baseErr.has(e) ? 'PREEXISTING' : 'NEW', 'C', k, 'error de consola: ' + e, baseErr.has(e) ? 'mismo error en el baseline' : 'error nuevo');
    const baseCsp = new Set([...(b.csp || []), ...(b.quickCsp || [])]);
    for (const e of [...(c.csp || []), ...(c.quickCsp || [])]) add(baseCsp.has(e) ? 'PREEXISTING' : 'NEW', 'C', k, 'CSP: ' + e, baseCsp.has(e) ? 'misma violación en el baseline' : 'violación nueva');
    for (const q of (c.quick || [])) add('NEW', 'C', k, 'prueba corta del menú: ' + q, 'el menú del candidato falla');
    if (c.desktop && (c.desktop.toggleDisplay !== 'none' || c.desktop.vis !== 'visible')) add('NEW', 'C', k, 'menú de escritorio alterado', JSON.stringify(c.desktop));
    // Oclusión de paradas de Tab (si ambos builds la registran)
    const co = occludedOutsideNav(c), bo = occludedOutsideNav(b);
    if (co && bo) {
      occlusionData++;
      const bset = new Set(bo.map(key));
      for (const o of co) if (!bset.has(key(o))) { const r = classifyOcclusion(k, o.active, o.occluder, Cb); add(r.cls, 'C', k, `parada de Tab tapada: ${o.active} [tapado por ${o.occluder}]`, r.reason, r.ev); }
      if (co.length > bo.length) add('AGGRAVATED', 'C', k, `más paradas tapadas que en el baseline (${co.length} > ${bo.length})`, 'recuento de oclusiones');
    }
  }
  if (navStops > 0) add('NEW', 'C', '*', `${navStops} paradas de Tab en el menú cerrado`, 'los enlaces ocultos no deben recibir foco');
  if (maxSx > 0) add('NEW', 'C', '*', `desplazamiento horizontal ${maxSx}px`, 'no debe haber scroll horizontal');

  // SEO
  const fields = ['pages', 'linkOccurrences', 'brokenCount', 'canonicalIssueCount', 'hreflangIssueCount'];
  const seoSame = !!(seo.candidate && seo.baseline) && fields.every(f => seo.candidate[f] === seo.baseline[f]);
  if (!seoSame) add(seo.candidate && seo.baseline ? 'NEW' : 'UNVERIFIED', 'SEO', '*', 'SEO distinto del baseline o ausente', JSON.stringify({ candidate: seo.candidate && fields.map(f => seo.candidate[f]), baseline: seo.baseline && fields.map(f => seo.baseline[f]) }));

  const count = (cls) => findings.filter(f => f.cls === cls).length;
  const coverage = { bCases, bExpected: 15, cCases, cExpected: 126 };
  const coverageOk = bCases === 15 && cCases >= 126;
  const blocking = count('NEW') + count('AGGRAVATED') + count('UNVERIFIED');
  const verdict = coverageOk && blocking === 0 ? 'PASS' : 'REVISAR';
  return {
    verdict, coverage, coverageOk,
    counts: { PREEXISTING: count('PREEXISTING'), AGGRAVATED: count('AGGRAVATED'), NEW: count('NEW'), UNVERIFIED: count('UNVERIFIED') },
    findings, metrics: { navStopsClosedMobile: navStops, maxSx, shotDiff, cCasesWithOcclusionData: occlusionData, seoSame }, memory,
    notes: ['shotDiff es informativo (carga no determinista observada también entre repeticiones del baseline).']
  };
}

export function loadResults(dir) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const B = {}, Cc = {}, Cb = {}, seo = {};
  for (const f of fs.readdirSync(dir).filter(f => /^(B|C)_(cand|base)_.*\.json$/.test(f)).sort()) {
    const j = read(f); const dst = f.startsWith('B_') ? B : f.startsWith('C_cand') ? Cc : Cb;
    for (const [k, v] of Object.entries(j.results)) dst[k === 'reduced-motion' ? `${f}:${k}` : k] = v;
  }
  for (const b of ['candidate', 'baseline']) { try { seo[b] = read(`seo_${b}.json`); } catch {} }
  let memory = null; try { memory = read('memory.json'); } catch {}
  return { B, Cc, Cb, seo, memory };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out');
  const out = oi >= 0 ? args[oi + 1] : null;
  const dir = args.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1)) || path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
  const S = evaluate(loadResults(dir));
  fs.writeFileSync(out || path.join(dir, 'SUMMARY.json'), JSON.stringify(S, null, 1));
  console.log(JSON.stringify({ verdict: S.verdict, coverage: S.coverage, counts: S.counts, metrics: S.metrics, findings: S.findings.map(f => `${f.cls} ${f.phase} ${f.case}: ${f.message} — ${f.reason}`) }, null, 1));
  process.exit(S.verdict === 'PASS' ? 0 : 1);
}
