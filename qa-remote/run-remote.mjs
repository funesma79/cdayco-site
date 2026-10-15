// QA remoto de A11Y-NAV-01: fases B y C en un runner cloud (Linux, macOS o Windows). Solo módulos nativos de Node >= 22.
// Uso (desde la raíz del repo, en la rama qa/a11y-nav-01-remote):
//   node qa-remote/run-remote.mjs --verify-only   # integridad del candidato frente a EXPECTED.json, sin navegador
//   node qa-remote/run-remote.mjs --dry-run       # sirve candidato y baseline y pasa la auditoría SEO, sin navegador
//   CHROME=/ruta/chrome node qa-remote/run-remote.mjs [--min-start 1500] [--guard 500]
//   EXTRA_CHROME_ARGS="--no-sandbox"               # solo en runners efímeros donde el sandbox de Chrome no arranque
// Candidato = raíz de este repositorio. Baseline = worktree temporal en el commit base de EXPECTED.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QA = path.dirname(fileURLToPath(import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: QA, encoding: 'utf8' }).trim();
const REPO = git('rev-parse', '--show-toplevel');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(QA, 'EXPECTED.json'), 'utf8'));
const BASE = EXPECTED.base_commit;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MIN_START = Number(opt('--min-start', 1500));
const GUARD = Number(opt('--guard', 500));
const RESULTS = path.join(QA, 'results'); fs.mkdirSync(path.join(RESULTS, 'shots'), { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(l); fs.appendFileSync(path.join(RESULTS, 'run.log'), l + '\n'); };
const availMB = () => { try { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/); if (m) return Math.round(Number(m[1]) / 1024); } catch {} return Math.round(os.freemem() / 1048576); };
let minSeen = Infinity; const memTick = () => { const a = availMB(); minSeen = Math.min(minSeen, a); return a; };

// 1) Integridad: los 41 ficheros servidos deben coincidir con los blobs auditados y no debe haber más cambios en el sitio
const verify = () => {
  const bad = [];
  for (const [f, blob] of Object.entries(EXPECTED.affected_blobs)) {
    const p = path.join(REPO, f);
    if (!fs.existsSync(p)) { bad.push(`falta ${f}`); continue; }
    const got = execFileSync('git', ['hash-object', '--path', f, p], { cwd: REPO, encoding: 'utf8' }).trim();
    if (got !== blob) bad.push(`${f}: ${got} != ${blob}`);
  }
  try { git('cat-file', '-e', `${BASE}^{commit}`); } catch { log(`Base ${BASE} ausente: git fetch --depth=1 origin ${BASE}`); execFileSync('git', ['fetch', '--depth=1', 'origin', BASE], { cwd: REPO, stdio: 'inherit' }); }
  const changed = execFileSync('git', ['diff', '--name-only', BASE, '--', '.', ':(exclude)qa-remote', ':(exclude).github'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
    .concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)qa-remote', ':(exclude).github'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean));
  const exp = new Set(Object.keys(EXPECTED.affected_blobs));
  for (const f of changed) if (!exp.has(f)) bad.push(`cambio no auditado: ${f}`);
  for (const f of exp) if (!changed.includes(f)) bad.push(`sin cambio frente a la base: ${f}`);
  return { ok: bad.length === 0, bad, changed: changed.length };
};
const v = verify();
log(`Integridad: ${v.ok ? 'OK' : 'FALLO'} (${Object.keys(EXPECTED.affected_blobs).length} blobs esperados, ${v.changed} ficheros del sitio cambiados frente a ${BASE.slice(0, 7)})`);
fs.writeFileSync(path.join(RESULTS, 'integrity.json'), JSON.stringify(v, null, 1));
if (!v.ok) { v.bad.forEach(b => log('  ' + b)); process.exit(5); }
if (args.includes('--verify-only')) process.exit(0);

// 2) Baseline como worktree temporal
const BASEDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cda-qa-baseline-'));
execFileSync('git', ['worktree', 'add', '--detach', BASEDIR, BASE], { cwd: REPO, stdio: 'ignore' });
const cleanup = () => { try { execFileSync('git', ['worktree', 'remove', '--force', BASEDIR], { cwd: REPO, stdio: 'ignore' }); } catch {} };
process.on('exit', cleanup);
const ROOTS = { candidate: REPO, baseline: BASEDIR };

const findChrome = () => {
  if (process.env.CHROME) return process.env.CHROME;
  const c = process.platform === 'win32' ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => fs.existsSync(p));
};
const waitHttp = async (url, tries = 80) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok || r.status === 404) return r; } catch {} await sleep(250); } throw new Error('no responde ' + url); };
const startServer = async (build) => {
  const p = spawn(process.execPath, [path.join(QA, 'harness', 'server.mjs')], { env: { ...process.env, CDA_ROOT: ROOTS[build] }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { if (!/API_POST/.test(String(d))) fs.appendFileSync(path.join(RESULTS, 'server.log'), d); });
  p.stderr.on('data', d => fs.appendFileSync(path.join(RESULTS, 'server.log'), d));
  await waitHttp('http://127.0.0.1:8766/');
  return p;
};
const stop = (p) => { if (p && p.exitCode === null) { try { p.kill(); } catch {} } };
const seoAudit = (build) => {
  const out = execFileSync(process.execPath, [path.join(QA, 'harness', 'seo-audit.mjs'), ROOTS[build]], { encoding: 'utf8' });
  fs.writeFileSync(path.join(RESULTS, `seo_${build}.json`), out);
  const j = JSON.parse(out); return `${j.pages} páginas, ${j.linkOccurrences} enlaces, ${j.brokenCount} rotos, ${j.canonicalIssueCount} avisos canonical, ${j.hreflangIssueCount} hreflang`;
};

const pages = fs.readFileSync(path.join(QA, 'pages.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const lots = []; for (let i = 0; i < pages.length; i += 7) lots.push(pages.slice(i, i + 7));
fs.mkdirSync(path.join(RESULTS, 'lots'), { recursive: true });
lots.forEach((l, i) => fs.writeFileSync(path.join(RESULTS, 'lots', `lote_${i + 1}.txt`), l.join('\n')));
const JOBS = [
  ['B_cand_es', 'B', 'candidate', '/direccion-produccion-eventos.html,/contacto.html'],
  ['B_cand_en', 'B', 'candidate', '/en/event-design-production.html,/en/contact.html'],
  ['B_cand_zh', 'B', 'candidate', '/zh/index.html,/zh/contacto.html'],
  ...lots.map((_, i) => [`C_cand_${i + 1}`, 'C', 'candidate', '@' + path.join(RESULTS, 'lots', `lote_${i + 1}.txt`)]),
  ...lots.map((_, i) => [`C_base_${i + 1}`, 'C', 'baseline', '@' + path.join(RESULTS, 'lots', `lote_${i + 1}.txt`)])
];
log(`REPO=${REPO} HEAD=${git('rev-parse', 'HEAD').slice(0, 12)} node=${process.version} ${process.platform} memoria=${memTick()} MB`);

if (args.includes('--dry-run')) {
  for (const build of ['candidate', 'baseline']) {
    const srv = await startServer(build); const codes = [];
    for (const u of ['/nav.js', '/base.css', '/direccion-produccion-eventos.html', '/en/contact.html', '/zh/index.html', '/analytics-consent.js']) codes.push(`${u}=${(await fetch('http://127.0.0.1:8766' + u)).status}`);
    stop(srv); await sleep(300);
    log(`DRY ${build}: ${codes.join(' ')} | SEO: ${seoAudit(build)}`);
  }
  log(`DRY: Chrome: ${findChrome() || 'NO ENCONTRADO (definir CHROME)'} | lotes C: ${lots.length} | trabajos: ${JOBS.length}`);
  process.exit(0);
}

const CHROME = findChrome();
if (!CHROME) { log('ERROR: Chrome/Chromium no encontrado; definir CHROME=/ruta'); process.exit(2); }
const EXTRA = (process.env.EXTRA_CHROME_ARGS || '').split(/\s+/).filter(Boolean);
log(`Chrome: ${CHROME} ${EXTRA.join(' ')} | umbral de arranque ${MIN_START} MB | guardián ${GUARD} MB`);
for (const b of ['candidate', 'baseline']) log(`SEO ${b}: ${seoAudit(b)}`);
let rc = 0;
for (const [tag, phase, build, batch] of JOBS) {
  const outJson = path.join(RESULTS, `${tag}.json`);
  if (fs.existsSync(outJson)) { log(`[${tag}] ya completado, se salta`); continue; }
  const free = memTick();
  if (free < MIN_START) { log(`[${tag}] NO ARRANCA: ${free} MB < ${MIN_START} MB. Progreso conservado.`); rc = 4; break; }
  const srv = await startServer(build);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cda-qa-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', ...EXTRA, '--remote-debugging-port=9333', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try { const r = await waitHttp('http://127.0.0.1:9333/json/version'); ws = (await r.json()).webSocketDebuggerUrl; }
  catch (e) { log(`[${tag}] Chrome no arranca: ${e.message} (en Linux probar EXTRA_CHROME_ARGS=--no-sandbox)`); stop(chrome); stop(srv); rc = 2; break; }
  const t0 = Date.now();
  const suite = spawn(process.execPath, [path.join(QA, 'a11y-nav-suite-v3.mjs'), ws, tag, phase, batch, outJson, path.join(RESULTS, 'shots')], { stdio: 'inherit' });
  let aborted = false;
  const timer = setInterval(() => { const a = memTick(); if (a < GUARD && suite.exitCode === null) { aborted = true; log(`[${tag}] CORTE: ${a} MB < ${GUARD} MB`); suite.kill(); } }, 3000);
  const code = await new Promise(r => suite.on('exit', r));
  clearInterval(timer);
  try { const w = new WebSocket(ws); await new Promise(r => { w.onopen = () => { w.send(JSON.stringify({ id: 1, method: 'Browser.close' })); setTimeout(r, 500); }; w.onerror = r; }); } catch {}
  stop(chrome); stop(srv); await sleep(800);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  log(`[${tag}] exit=${code} t=${Math.round((Date.now() - t0) / 1000)}s memoria antes=${free} MB`);
  if (aborted) { try { fs.unlinkSync(outJson); } catch {} rc = 3; break; }
  if (code !== 0) rc = 1;
}
fs.writeFileSync(path.join(RESULTS, 'memory.json'), JSON.stringify({ minAvailableMB: minSeen, guardMB: GUARD, minStartMB: MIN_START }, null, 1));
log(`FIN rc=${rc} memoria mínima observada=${minSeen} MB${rc === 0 ? ' | siguiente: node qa-remote/compare.mjs' : ''}`);
process.exit(rc);
