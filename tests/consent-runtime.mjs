import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'analytics-consent.js'), 'utf8');

function createEnvironment(savedChoice) {
  const byId = new Map();
  const documentListeners = new Map();

  class Element {
    constructor(tagName, options = {}) {
      this.tagName = tagName.toUpperCase();
      this.id = options.id || '';
      this.className = options.className || '';
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.textContent = '';
      this.parentNode = null;
      this.rect = options.rect || { top: 0, bottom: 0 };
      this.scrolled = false;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    setAttribute(name, value) {
      this.attributes.set(name, value);
    }

    querySelector(selector) {
      if (selector === '.wrap') {
        return this.children.find(child => child.className === 'wrap') || null;
      }
      return null;
    }

    querySelectorAll() {
      return [];
    }

    contains(target) {
      return target === this || this.children.some(child => child.contains(target));
    }

    getBoundingClientRect() {
      return this.rect;
    }

    scrollIntoView() {
      this.scrolled = true;
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      if (this.id) byId.delete(this.id);
      this.parentNode = null;
    }
  }

  const head = new Element('head');
  const body = new Element('body');
  const footer = new Element('footer');
  const footerWrap = new Element('div', { className: 'wrap' });
  footer.appendChild(footerWrap);
  body.appendChild(footer);

  const document = {
    readyState: 'complete',
    documentElement: { lang: 'es' },
    head,
    body,
    cookie: '',
    createElement: tagName => new Element(tagName),
    getElementById: id => byId.get(id) || null,
    querySelector: selector => selector === 'footer' ? footer : null,
    addEventListener: (type, listener) => documentListeners.set(type, listener)
  };

  const localStorage = {
    getItem: () => savedChoice,
    setItem: () => {},
    removeItem: () => {}
  };

  const window = {
    dataLayer: [],
    requestAnimationFrame: callback => callback()
  };

  vm.runInNewContext(source, {
    document,
    window,
    localStorage,
    Date,
    JSON,
    encodeURIComponent
  });

  return { Element, body, footerWrap, head, documentListeners, byId };
}

const denied = JSON.stringify({ value: 'denied', ts: Date.now() });
const decided = createEnvironment(denied);
const settings = decided.byId.get('cda-cookie-settings');

assert.ok(settings, 'saved consent renders the settings control');
assert.equal(settings.parentNode, decided.footerWrap, 'settings control lives in the footer');
assert.ok(decided.head.children.some(child => child.tagName === 'STYLE'), 'consent styles are installed');
assert.ok(decided.documentListeners.has('focusin'), 'focus protection is installed');

const undecided = createEnvironment(null);
const banner = undecided.byId.get('cda-consent');
const obscuredTarget = new undecided.Element('a', { rect: { top: 420, bottom: 464 } });

assert.ok(banner, 'undecided consent renders the banner');
banner.rect = { top: 400, bottom: 560 };
undecided.body.appendChild(obscuredTarget);
undecided.documentListeners.get('focusin')({ target: obscuredTarget });
assert.equal(obscuredTarget.scrolled, true, 'obscured focused content is brought into view');

console.log('PASS consent runtime: footer placement and focus protection');
