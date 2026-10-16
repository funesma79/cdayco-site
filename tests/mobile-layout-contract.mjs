import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'base.css'), 'utf8');
const consent = fs.readFileSync(path.join(root, 'analytics-consent.js'), 'utf8');

const contracts = [
  [css, /\.menu-toggle\{[^}]*min-width:44px;[^}]*min-height:44px;/, 'menu toggle keeps a 44px touch target'],
  [css, /nav\.primary-nav\{[\s\S]*?height:100dvh;[\s\S]*?overflow-y:auto;/, 'mobile drawer fits short viewports'],
  [css, /nav\.primary-nav\.is-open\{[^}]*visibility:visible;[^}]*pointer-events:auto;/, 'closed drawer is not interactive'],
  [css, /body:has\(nav\.primary-nav\.is-open\)\{overflow:hidden;/, 'open drawer locks background scroll'],
  [css, /\.lang-switch a\{[^}]*min-width:44px;[^}]*min-height:44px;/, 'language targets are touch friendly'],
  [consent, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'mobile consent actions stay compact'],
  [consent, /footer #cda-cookie-settings \{[\s\S]*?position: static;/, 'cookie settings no longer overlays page content'],
  [consent, /function keepFocusedContentVisible\(event\)/, 'consent banner protects focused content'],
  [consent, /document\.addEventListener\('focusin', keepFocusedContentVisible\)/, 'focus protection is installed']
];

for (const [source, pattern, message] of contracts) {
  assert.match(source, pattern, message);
}

console.log(`PASS ${contracts.length} mobile layout contracts`);
