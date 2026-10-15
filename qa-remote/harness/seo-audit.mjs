import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(here, '../audit-cdayco-pr');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

function routeFor(file) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}

function normalizePath(raw, baseRoute) {
  const url = new URL(raw, `https://cdayco.com${baseRoute}`);
  if (url.hostname !== 'cdayco.com' && url.hostname !== 'www.cdayco.com') return null;
  let pathname = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
  if (pathname.endsWith('.html')) pathname = pathname.slice(0, -5) || '/';
  return pathname;
}

const files = walk(root);
const pages = new Map();

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const route = routeFor(file);
  const canonicalMatch = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  const langMatch = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  const alternates = [...html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhreflang=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map(match => ({ lang: match[1], target: normalizePath(match[2], route), href: match[2] }));
  const links = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);
  pages.set(route, {
    file: path.relative(root, file).replaceAll('\\', '/'),
    route,
    lang: langMatch?.[1] || null,
    canonical: canonicalMatch ? normalizePath(canonicalMatch[1], route) : null,
    canonicalRaw: canonicalMatch?.[1] || null,
    alternates,
    links
  });
}

const broken = [];
for (const page of pages.values()) {
  for (const href of page.links) {
    if (/^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const target = normalizePath(href, page.route);
    if (target !== null && !pages.has(target)) broken.push({ source: page.route, href, target });
  }
}

const canonicalIssues = [];
for (const page of pages.values()) {
  if (!page.canonical) canonicalIssues.push({ route: page.route, issue: 'missing' });
  else if (!pages.has(page.canonical)) canonicalIssues.push({ route: page.route, issue: 'target_missing', target: page.canonical });
  else if (page.canonical !== page.route) canonicalIssues.push({ route: page.route, issue: 'non_self', target: page.canonical });
}

const hreflangIssues = [];
for (const page of pages.values()) {
  for (const alt of page.alternates) {
    const target = pages.get(alt.target);
    if (!target) {
      hreflangIssues.push({ source: page.route, lang: alt.lang, target: alt.target, issue: 'target_missing' });
      continue;
    }
    if (alt.lang === 'x-default') continue;
    const sourceLang = page.lang;
    const reciprocal = target.alternates.some(candidate => candidate.lang === sourceLang && candidate.target === page.route);
    if (!reciprocal) hreflangIssues.push({ source: page.route, lang: alt.lang, target: alt.target, issue: `no_return_${sourceLang}` });
  }
}

console.log(JSON.stringify({
  pages: pages.size,
  linkOccurrences: [...pages.values()].reduce((n, page) => n + page.links.length, 0),
  brokenCount: broken.length,
  broken,
  canonicalIssueCount: canonicalIssues.length,
  canonicalIssues,
  hreflangIssueCount: hreflangIssues.length,
  hreflangIssues
}, null, 2));
