// Suite A11Y-NAV-01 v3 por fases (CDP, sin dependencias). Criterios de B y C idénticos a la v2.
// Uso: node a11y-nav-suite-v3.mjs <wsUrl> <label> <fase A|B|C> <páginas csv o @fichero> <outJson> <shotsDir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [wsUrl, label, phase, pagesArg, outJson, shotsDir] = process.argv.slice(2);
const pages = pagesArg.startsWith('@') ? fs.readFileSync(pagesArg.slice(1), 'utf8').split(/\r?\n/).filter(Boolean) : pagesArg.split(',');
const ORIGIN = 'http://127.0.0.1:8766';
const ws = new WebSocket(wsUrl);
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); };
await new Promise(r => (ws.onopen = r));
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable'); await s('Accessibility.enable');
await s('Page.addScriptToEvaluateOnNewDocument', { source: `window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));` });
const ev = async (expression) => { const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const press = async (k, code, vk, modifiers = 0) => {
  await s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, text: k === 'Enter' ? '\r' : (k === ' ' ? ' ' : undefined) });
  await s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const tab = (shift) => press('Tab', 'Tab', 9, shift ? 8 : 0);
const clickAt = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const tapAt = async (x, y) => { await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const load = async (p, width, height = 900, { reducedMotion = false } = {}) => {
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  await s('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'local_storage' });
  events.length = 0;
  await s('Page.navigate', { url: ORIGIN + p });
  for (let t = 0; t < 150 && !events.some(e => e.method === 'Page.loadEventFired'); t++) await sleep(100);
  await ev('document.fonts.ready.then(()=>1)'); await sleep(600);
};
const errorsNow = () => events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/favicon\.ico/.test(e.params.entry.url || e.params.entry.text))).map(e => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text || e.params.entry?.text);
const ST = `(() => { const n = document.getElementById('primary-nav'), t = document.getElementById('menu-toggle'), de = document.documentElement, a = document.activeElement;
  const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return false; const x = r.left + r.width/2, y = r.top + r.height/2; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false; const h = document.elementFromPoint(x, y); return !!h && (el === h || el.contains(h)); };
  const occluder = (el) => { const r = el.getBoundingClientRect(); if (!r.width) return 'NO_BOX'; const x = r.left + r.width/2, y = r.top + r.height/2; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return 'OFFSCREEN'; const h = document.elementFromPoint(x, y); if (!h) return 'NONE'; if (el === h || el.contains(h)) return null; const idEl = h.closest('[id]'); return idEl ? '#' + idEl.id : h.tagName.toLowerCase() + (h.classList.length ? '.' + h.classList[0] : ''); };
  const ar = a.getBoundingClientRect(); const banner = document.getElementById('cda-consent'); const bTop = banner ? banner.getBoundingClientRect().top : innerHeight;
  return { exp: t && t.getAttribute('aria-expanded'), open: n && n.classList.contains('is-open'), vis: n && getComputedStyle(n).visibility, tf: n && getComputedStyle(n).transform,
    sx: Math.max(scrollX, de.scrollLeft, document.body.scrollLeft), vw: de.clientWidth,
    active: a === document.body ? 'BODY' : a.tagName + '|' + (a.id || a.getAttribute('aria-label') || (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,28)),
    activeInNav: !!(n && n.contains(a)), activeIsToggle: a === t, activeHit: a === document.body ? null : hit(a), activeOccluder: a === document.body ? null : occluder(a), activeFocusVisible: a.matches(':focus-visible'), activeOutline: getComputedStyle(a).outlineStyle,
    activeFullyAboveBanner: ar.top >= 0 && ar.bottom <= bTop, activeTop: Math.round(ar.top), activeBottom: Math.round(ar.bottom),
    toggleHit: t ? hit(t) : null, toggleDisplay: t ? getComputedStyle(t).display : null,
    banner: !!banner, bannerTop: banner ? Math.round(bTop) : null,
    lastNavBottom: n ? Math.round([...n.querySelectorAll('a')].pop().getBoundingClientRect().bottom) : null,
    navLinkRects: n ? [...n.querySelectorAll('a')].map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }) : null,
    navScrollTop: n ? Math.round(n.scrollTop) : null, navScrollable: n ? n.scrollHeight > n.clientHeight + 1 : null }; })()`;
const st = () => ev(ST);
const axNav = async () => {
  const r = await s('Runtime.evaluate', { expression: `document.querySelector('#primary-nav a')` });
  if (!r.result.objectId) return 'NO_NODE';
  const ax = await s('Accessibility.getPartialAXTree', { objectId: r.result.objectId, fetchRelatives: false });
  return ax.nodes[0].ignored ? 'ignored' : 'exposed';
};
const toggleCenter = () => ev(`(() => { const b = document.getElementById('menu-toggle').getBoundingClientRect(); return [b.left + b.width/2, b.top + b.height/2]; })()`);
const navLinkCount = () => ev(`document.querySelectorAll('#primary-nav a').length`);
const out = { label, phase, pages, results: {} };

if (phase === 'A') {
  // Escenario que falló: 390x667, banner visible, menú abierto, recorrido completo
  for (const p of pages) {
    const f = []; const chk = (c, m) => { if (!c) f.push(m); }; const R = { steps: [] };
    await load(p, 390, 667);
    let x = await st(); chk(x.banner, 'precondición: banner no visible');
    await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450);
    x = await st(); chk(x.open && x.exp === 'true' && x.vis === 'visible', 'no abre'); chk(x.navScrollable, 'panel no desplazable con banner'); chk(x.toggleHit, 'X tapada al abrir');
    const n = await navLinkCount();
    const stepCheck = (x, tag) => { R.steps.push({ tag, a: x.active, top: x.activeTop, bottom: x.activeBottom, bannerTop: x.bannerTop, scroll: x.navScrollTop });
      chk(x.activeHit, `${tag}: foco tapado (${x.active})`); chk(x.activeFullyAboveBanner, `${tag}: enlace no entero por encima del banner (${x.activeTop}-${x.activeBottom} / ${x.bannerTop})`);
      chk(x.activeFocusVisible && x.activeOutline !== 'none', `${tag}: foco no visible`); chk(x.toggleHit, `${tag}: X tapada`); chk(x.sx === 0, `${tag}: scroll horizontal`); chk(x.open, `${tag}: menú cerrado inesperadamente`); };
    for (let i = 0; i < n; i++) { await tab(); await sleep(80); x = await st(); chk(x.activeInNav, `Tab ${i + 1} fuera del menú: ${x.active}`); stepCheck(x, `Tab ${i + 1}`); }
    for (let i = n - 1; i >= 1; i--) { await tab(true); await sleep(80); x = await st(); chk(x.activeInNav, `Shift+Tab hacia ${i} fuera del menú: ${x.active}`); stepCheck(x, `Shift+Tab ${i}`); }
    await tab(true); await sleep(80); x = await st(); chk(x.activeIsToggle && x.open, 'Shift+Tab final no llega a la X: ' + x.active);
    // Escape desde el último enlace (panel desplazado al fondo)
    for (let i = 0; i < n; i++) await tab(); await sleep(80);
    await press('Escape', 'Escape', 27); await sleep(450); x = await st();
    chk(!x.open && x.exp === 'false' && x.vis === 'hidden' && x.activeIsToggle, 'Escape: ' + JSON.stringify([x.open, x.exp, x.vis, x.active]));
    // Clic en la X con el panel desplazado al fondo
    await press('Enter', 'Enter', 13); await sleep(450); for (let i = 0; i < n; i++) await tab(); await sleep(80);
    const [tx, ty] = await toggleCenter(); x = await st(); chk(x.toggleHit, 'X tapada con panel desplazado');
    await clickAt(tx, ty); await sleep(450); x = await st(); chk(!x.open && x.exp === 'false' && x.vis === 'hidden', 'clic en X con panel desplazado no cierra');
    const shotP = await s('Page.captureScreenshot', { format: 'png' }); // estado cerrado final
    await press('Enter', 'Enter', 13); await sleep(450); for (let i = 0; i < n; i++) await tab(); await sleep(120);
    const shot = await s('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotsDir, `A-${label}-${p.replace(/\W+/g, '_')}-390x667-ultimo.png`), Buffer.from(shot.data, 'base64'));
    R.errors = errorsNow(); R.csp = await ev('window.__csp'); chk(!R.errors.length, 'consola: ' + R.errors.join('|')); chk(!R.csp.length, 'CSP');
    out.results[p] = { fails: f, ...R };
  }
}

if (phase === 'B') {
  for (const p of pages) for (const width of [390, 820]) {
    const f = []; const chk = (cond, msg) => { if (!cond) f.push(msg); }; const R = {};
    await load(p, width);
    let x = await st();
    chk(x.exp === 'false' && !x.open && x.vis === 'hidden', 'cerrado inicial no sincronizado: ' + JSON.stringify([x.exp, x.open, x.vis]));
    chk((await axNav()) === 'ignored', 'AX: enlaces expuestos con menú cerrado'); chk(x.toggleHit, 'botón no pulsable cerrado');
    let [tx, ty] = await toggleCenter();
    await clickAt(tx, ty); await sleep(120); x = await st(); R.openMid = x.tf;
    chk(x.exp === 'true' && x.open && x.vis === 'visible', 'clic no abre'); chk(x.toggleHit, 'botón tapado durante la apertura');
    chk(x.tf !== 'none' && x.tf !== 'matrix(1, 0, 0, 1, 0, 0)', 'sin animación de apertura');
    await sleep(400); x = await st();
    chk(x.toggleHit, 'botón tapado con menú abierto'); chk((await axNav()) === 'exposed', 'AX: no expuestos con menú abierto');
    chk(!x.banner || x.lastNavBottom <= x.bannerTop, `banner tapa el último enlace (${x.lastNavBottom} > ${x.bannerTop})`); chk(x.sx === 0, 'scroll horizontal al abrir');
    await clickAt(tx, ty); await sleep(120); x = await st(); R.closeMid = x.tf;
    chk(x.exp === 'false' && !x.open, 'clic no cierra'); chk(x.vis === 'visible' && x.tf !== 'matrix(1, 0, 0, 1, 0, 0)', 'sin animación de cierre'); chk(x.toggleHit, 'botón tapado durante el cierre');
    await sleep(400); x = await st(); chk(x.vis === 'hidden', 'no se oculta tras cerrar'); chk((await axNav()) === 'ignored', 'AX: expuestos tras cerrar');
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await tapAt(tx, ty); await sleep(450); x = await st(); chk(x.open && x.exp === 'true', 'tap no abre');
    await tapAt(tx, ty); await sleep(450); x = await st(); chk(!x.open && x.exp === 'false', 'tap no cierra');
    await s('Emulation.setTouchEmulationEnabled', { enabled: false });
    await ev(`document.getElementById('menu-toggle').focus()`);
    await press('Enter', 'Enter', 13); await sleep(450); x = await st(); chk(x.open && x.exp === 'true' && x.vis === 'visible', 'Enter no abre');
    await press('Enter', 'Enter', 13); await sleep(450); x = await st(); chk(!x.open && x.exp === 'false' && x.vis === 'hidden', 'Enter no cierra');
    await press(' ', 'Space', 32); await sleep(450); x = await st(); chk(x.open && x.exp === 'true', 'Espacio no abre');
    await press(' ', 'Space', 32); await sleep(450); x = await st(); chk(!x.open && x.exp === 'false', 'Espacio no cierra');
    await ev(`document.getElementById('menu-toggle').focus()`); await tab(); await sleep(50); x = await st(); chk(!x.activeInNav && x.sx === 0, 'Tab con menú cerrado entra en el menú: ' + x.active);
    await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450);
    const nLinks = await navLinkCount(); R.tabs = [];
    for (let i = 0; i < nLinks; i++) { await tab(); await sleep(30); x = await st(); R.tabs.push(x.active);
      chk(x.activeInNav && x.open, `Tab ${i + 1} fuera del menú: ${x.active}`); chk(x.activeHit, `Tab ${i + 1}: foco tapado (${x.active})`);
      chk(x.activeFocusVisible && x.activeOutline !== 'none', `Tab ${i + 1}: foco no visible`); chk(x.sx === 0, `Tab ${i + 1}: scroll horizontal`); }
    for (let i = 0; i < nLinks; i++) await tab(true);
    await sleep(50); x = await st(); chk(x.activeIsToggle && x.open, 'Shift+Tab no vuelve al botón: ' + x.active); chk(x.activeFocusVisible && x.activeOutline !== 'none', 'foco del botón no visible');
    for (let i = 0; i < nLinks + 1; i++) await tab();
    await sleep(450); x = await st(); R.afterLast = { active: x.active, hit: x.activeHit, occluder: x.activeOccluder };
    chk(!x.activeInNav && !x.open && x.exp === 'false' && x.vis === 'hidden', 'Tab tras el último enlace no cierra: ' + JSON.stringify([x.active, x.open, x.exp, x.vis]));
    chk(x.activeHit !== false, 'foco tapado tras salir del menú: ' + x.active + ' [tapado por ' + x.activeOccluder + ']'); chk(x.sx === 0, 'scroll horizontal al salir');
    await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450);
    await tab(true); await sleep(450); x = await st(); chk(!x.open && x.exp === 'false' && !x.activeInNav, 'Shift+Tab desde el botón no cierra: ' + x.active);
    await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450);
    await tab(); await tab(); await sleep(30); await press('Escape', 'Escape', 27); await sleep(450); x = await st();
    chk(!x.open && x.exp === 'false' && x.vis === 'hidden' && x.activeIsToggle, 'Escape desde enlace: ' + JSON.stringify([x.open, x.exp, x.vis, x.active]));
    await press('Enter', 'Enter', 13); await sleep(450); await press('Escape', 'Escape', 27); await sleep(450); x = await st();
    chk(!x.open && x.exp === 'false' && x.activeIsToggle, 'Escape desde el botón no cierra');
    x = await st();
    if (x.banner) {
      await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450);
      const bh = await ev(`[...document.querySelectorAll('#cda-consent [data-choice]')].map(b => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return b === h || b.contains(h); })`);
      chk(bh.every(Boolean), 'botones del banner tapados con menú abierto');
      const [bx, by] = await ev(`(() => { const r = document.querySelector('#cda-consent [data-choice="denied"]').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`);
      await clickAt(bx, by); await sleep(450); x = await st();
      const settings = await ev(`!!document.getElementById('cda-cookie-settings')`);
      chk(!x.banner && settings, 'el clic en Rechazar con menú abierto no funciona');
      R.menuAfterBannerClick = { open: x.open, exp: x.exp }; chk(x.exp === (x.open ? 'true' : 'false'), 'estado desincronizado tras el banner');
      if (x.open) { await clickAt(tx, ty); await sleep(450); }
    } else { await load(p, width); }
    await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(450); x = await st();
    R.linkRectsNoBanner = x.navLinkRects;
    if (width === 390) { const shot = await s('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotsDir, `B-${label}-${p.replace(/\W+/g, '_')}-${width}-abierto.png`), Buffer.from(shot.data, 'base64')); }
    await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(300); x = await st();
    chk(x.exp === 'false' && !x.open, 'al pasar a escritorio queda aria-expanded=true');
    R.errors = errorsNow(); R.csp = await ev('window.__csp');
    chk(R.errors.length === 0, 'errores de consola: ' + R.errors.join(' | ')); chk(R.csp.length === 0, 'CSP: ' + R.csp.join(' | '));
    out.results[p + '@' + width] = { fails: f, ...R };
  }
  // prefers-reduced-motion (primera página)
  const f = []; const chk = (c, m) => { if (!c) f.push(m); };
  await load(pages[0], 390, 900, { reducedMotion: true });
  await ev(`document.getElementById('menu-toggle').focus()`); await press('Enter', 'Enter', 13); await sleep(40); let x = await st();
  chk(x.vis === 'visible' && x.tf === 'matrix(1, 0, 0, 1, 0, 0)', 'reduced-motion: apertura animada ' + x.tf);
  await press('Enter', 'Enter', 13); await sleep(40); x = await st(); chk(x.vis === 'hidden', 'reduced-motion: cierre no inmediato ' + x.vis);
  out.results['reduced-motion'] = { fails: f };
}

if (phase === 'C') {
  for (const p of pages) for (const width of [390, 820, 1440]) {
    await load(p, width);
    const shot = await s('Page.captureScreenshot', { format: 'png' });
    const shotHash = crypto.createHash('sha256').update(shot.data).digest('hex').slice(0, 16);
    const seq = [], occluded = []; let maxSx = 0, first = null;
    for (let i = 0; i < 300; i++) { await tab(); const x = await st(); if (x.active === first || (x.active === 'BODY' && i > 0)) break; if (i === 0) first = x.active; seq.push(x.active + (x.activeInNav ? ' [NAV]' : '')); if (x.activeHit === false) occluded.push({ active: x.active, inNav: x.activeInNav, occluder: x.activeOccluder }); maxSx = Math.max(maxSx, x.sx); }
    const rec = { shotHash, seq, occluded, maxSx, errors: errorsNow(), csp: await ev('window.__csp') };
    const hasNav = await ev(`!!document.getElementById('primary-nav')`);
    if (hasNav && width === 1440) { const x = await st(); rec.desktop = { toggleDisplay: x.toggleDisplay, vis: x.vis }; }
    if (hasNav && width < 1440) {
      const f = []; const chk = (c, m) => { if (!c) f.push(m); };
      await load(p, width);
      const [tx, ty] = await toggleCenter();
      await clickAt(tx, ty); await sleep(450); let x = await st();
      chk(x.open && x.exp === 'true' && x.vis === 'visible' && x.toggleHit, 'abrir/botón visible');
      chk(!x.banner || x.lastNavBottom <= x.bannerTop, 'banner tapa enlaces');
      const n = await navLinkCount();
      await ev(`document.getElementById('menu-toggle').focus()`);
      for (let i = 0; i < n; i++) { await tab(); await sleep(20); x = await st(); chk(x.activeInNav && x.activeHit && x.sx === 0, 'Tab ' + (i + 1) + ' ' + x.active); }
      await press('Escape', 'Escape', 27); await sleep(450); x = await st();
      chk(!x.open && x.exp === 'false' && x.vis === 'hidden' && x.activeIsToggle, 'Escape');
      await clickAt(tx, ty); await sleep(450); await clickAt(tx, ty); await sleep(450); x = await st();
      chk(!x.open && x.exp === 'false' && x.vis === 'hidden', 'cerrar con clic'); chk((await axNav()) === 'ignored', 'AX cerrado');
      rec.quick = f; rec.quickErrors = errorsNow(); rec.quickCsp = await ev('window.__csp');
    }
    out.results[p + '@' + width] = rec;
  }
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log('DONE', label, phase, Object.keys(out.results).length);
await send('Target.closeTarget', { targetId }); ws.close(); process.exit(0);
