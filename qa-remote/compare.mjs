// Resume los resultados de run-bc.mjs y compara candidato con baseline (mismas reglas que la ronda del 15/10).
// Uso: node qa-remote/compare.mjs   → qa-remote/results/SUMMARY.json; código de salida 0 = PASS, 1 = REVISAR
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
const read = (f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const files = fs.readdirSync(R).filter(f => /^(B|C)_(cand|base)_.*\.json$/.test(f));
const B = {}, Cc = {}, Cb = {};
for (const f of files) { const j = read(f); const dst = f.startsWith('B_') ? B : f.startsWith('C_cand') ? Cc : Cb;
  for (const [k, v] of Object.entries(j.results)) dst[k === 'reduced-motion' ? `${f}:${k}` : k] = v; }
const S = { B: { fails: {} }, C: { pages: 0, seqRuleFail: [], navStopsClosedMobile: 0, maxSx: 0, errors: [], csp: [], quickFail: {}, shotDiff: [], desktopIssues: [] }, SEO: {} };
for (const [k, v] of Object.entries(B)) if (v.fails?.length) S.B.fails[k] = v.fails;
S.B.cases = Object.keys(B).length;
for (const [k, c] of Object.entries(Cc)) {
  S.C.pages++; const b = Cb[k]; const w = k.split('@')[1];
  S.C.maxSx = Math.max(S.C.maxSx, c.maxSx);
  if (w !== '1440') S.C.navStopsClosedMobile += c.seq.filter(x => x.endsWith('[NAV]')).length;
  if (c.errors.length || c.quickErrors?.length) S.C.errors.push(k + ': ' + [...c.errors, ...(c.quickErrors || [])].join(' | '));
  if (c.csp.length || c.quickCsp?.length) S.C.csp.push(k + ': ' + [...c.csp, ...(c.quickCsp || [])].join(' | '));
  if (c.quick?.length) S.C.quickFail[k] = c.quick;
  if (c.desktop && (c.desktop.toggleDisplay !== 'none' || c.desktop.vis !== 'visible')) S.C.desktopIssues.push(k);
  if (!b) { S.C.seqRuleFail.push(k + ' (sin baseline)'); continue; }
  const expected = w === '1440' ? b.seq : b.seq.filter(x => !x.endsWith(' [NAV]'));
  if (JSON.stringify(c.seq) !== JSON.stringify(expected)) S.C.seqRuleFail.push(k);
  if (c.shotHash !== b.shotHash) S.C.shotDiff.push(k);
}
for (const b of ['candidate', 'baseline']) { try { S.SEO[b] = read(`seo_${b}.json`); delete S.SEO[b].broken; } catch {} }
try { S.memory = read('memory.json'); } catch {}
const seoSame = S.SEO.candidate && S.SEO.baseline && ['pages', 'linkOccurrences', 'brokenCount', 'canonicalIssueCount', 'hreflangIssueCount'].every(k => S.SEO.candidate[k] === S.SEO.baseline[k]);
const pass = S.B.cases === 12 + 3 && !Object.keys(S.B.fails).length
  && S.C.pages >= 126 && !S.C.seqRuleFail.length && S.C.navStopsClosedMobile === 0 && S.C.maxSx === 0
  && !S.C.errors.length && !S.C.csp.length && !Object.keys(S.C.quickFail).length && !S.C.desktopIssues.length && seoSame;
S.verdict = pass ? 'PASS' : 'REVISAR';
S.notes = [
  'shotDiff es informativo: en la ronda del 15/10 hubo hashes alternos también entre repeticiones del baseline (carga no determinista). Revisar visualmente si aparecen.',
  'Fallo conocido y preexistente: el banner de cookies puede tapar contenido enfocado de la página (criterio "foco tapado tras salir del menú"); verificar que el elemento que tapa es #cda-consent.'
];
fs.writeFileSync(path.join(R, 'SUMMARY.json'), JSON.stringify(S, null, 1));
console.log(JSON.stringify({ B_casos: S.B.cases, B_fallos: S.B.fails, C_casos: S.C.pages, C_regla_secuencia: S.C.seqRuleFail, C_paradas_menu_cerrado: S.C.navStopsClosedMobile, C_scroll_max: S.C.maxSx, C_errores: S.C.errors, C_csp: S.C.csp, C_rapida: S.C.quickFail, C_capturas_distintas: S.C.shotDiff.length, SEO_igual: seoSame, memoria: S.memory, veredicto: S.verdict }, null, 1));
process.exit(pass ? 0 : 1);
