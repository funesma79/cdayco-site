(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-Q5GTCW4D3J';
  const STORAGE_KEY = 'cda_analytics_consent_v1';
  const CONSENT_MAX_AGE = 730 * 24 * 60 * 60 * 1000; // 24 meses aprox.

  const isEnglish =
    (document.documentElement.lang || '')
      .toLowerCase()
      .startsWith('en');

  const COPY = isEnglish
    ? {
        settingsAria: 'Change cookie preferences',
        dialogAria: 'Cookie preferences',
        body:
          'We use Google Analytics only if you accept it ' +
          'to measure visits and pages viewed and improve cdayco.com.',
        more: 'More information (Spanish)',
        reject: 'Reject analytics',
        accept: 'Accept analytics'
      }
    : {
        settingsAria: 'Cambiar preferencias de cookies',
        dialogAria: 'Preferencias de cookies',
        body:
          'Utilizamos Google Analytics únicamente si lo aceptas ' +
          'para medir visitas, páginas consultadas y mejorar cdayco.com.',
        more: 'Más información',
        reject: 'Rechazar analítica',
        accept: 'Aceptar analítica'
      };


  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  // Consent Mode: todo denegado hasta decisión expresa.
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500
  });

  window.gtag('set', 'ads_data_redaction', true);

  function readChoice() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const saved = JSON.parse(raw);

      if (!saved || !saved.value || !saved.ts) return null;

      if (Date.now() - saved.ts > CONSENT_MAX_AGE) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return saved.value;
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          value,
          ts: Date.now()
        })
      );
    } catch (_) {}
  }

  function clearGaCookies() {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();

      if (!name.startsWith('_ga')) return;

      const expirations = [
        `${name}=; Max-Age=0; path=/`,
        `${name}=; Max-Age=0; path=/; domain=.cdayco.com`,
        `${name}=; Max-Age=0; path=/; domain=cdayco.com`
      ];

      expirations.forEach(value => {
        document.cookie = value;
      });
    });
  }

  function loadAnalytics() {
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });

    if (document.getElementById('cda-ga4')) return;

    const script = document.createElement('script');
    script.id = 'cda-ga4';
    script.async = true;
    script.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(MEASUREMENT_ID);

    document.head.appendChild(script);

    window.gtag('js', new Date());

    window.gtag('config', MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  function denyAnalytics() {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });

    clearGaCookies();
  }

  function hasAnalyticsConsent() {
    return readChoice() === 'granted';
  }

  function trackEvent(name, params = {}) {
    if (!hasAnalyticsConsent()) {
      return false;
    }

    window.gtag('event', name, params);
    return true;
  }

  window.cdaAnalytics = Object.freeze({
    hasConsent: hasAnalyticsConsent,
    event: trackEvent
  });

  function addStyles() {
    const style = document.createElement('style');

    style.textContent = `
      #cda-consent {
        position: fixed;
        left: 18px;
        right: 18px;
        bottom: 18px;
        max-width: 760px;
        margin: 0 auto;
        padding: 20px;
        background: #14140f;
        color: #f5f5f3;
        border: 1px solid #a8905c;
        box-shadow: 0 14px 50px rgba(0,0,0,.25);
        z-index: 99999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      #cda-consent p {
        margin: 0 0 14px;
      }

      #cda-consent a {
        color: #f5f5f3;
        text-decoration: underline;
      }

      .cda-consent-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .cda-consent-btn {
        min-width: 150px;
        padding: 10px 16px;
        border: 1px solid #f5f5f3;
        background: #f5f5f3;
        color: #14140f;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
      }

      #cda-cookie-settings {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 99998;
        padding: 8px 12px;
        border: 1px solid #14140f;
        background: #f5f5f3;
        color: #14140f;
        cursor: pointer;
        font-size: 12px;
      }

      @media (max-width: 560px) {
        .cda-consent-btn {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function showSettingsButton() {
    if (document.getElementById('cda-cookie-settings')) return;

    const button = document.createElement('button');

    button.id = 'cda-cookie-settings';
    button.type = 'button';
    button.textContent = 'Cookies';

    button.setAttribute(
      'aria-label',
      COPY.settingsAria
    );

    button.addEventListener('click', () => {
      button.remove();
      showBanner();
    });

    document.body.appendChild(button);
  }

  function showBanner() {
    if (document.getElementById('cda-consent')) return;

    const banner = document.createElement('div');

    banner.id = 'cda-consent';
    banner.setAttribute('role', 'dialog');

    banner.setAttribute(
      'aria-label',
      COPY.dialogAria
    );

    banner.innerHTML = `
      <p>
        ${COPY.body}
        <a href="/cookies">${COPY.more}</a>.
      </p>

      <div class="cda-consent-actions">

        <button
          type="button"
          class="cda-consent-btn"
          data-choice="denied">
          ${COPY.reject}
        </button>

        <button
          type="button"
          class="cda-consent-btn"
          data-choice="granted">
          ${COPY.accept}
        </button>

      </div>
    `;

    banner
      .querySelectorAll('[data-choice]')
      .forEach(button => {

        button.addEventListener('click', () => {

          const choice =
            button.dataset.choice;

          saveChoice(choice);

          if (choice === 'granted') {
            loadAnalytics();
          } else {
            denyAnalytics();
          }

          banner.remove();
          showSettingsButton();
        });

      });

    document.body.appendChild(banner);
  }

  function init() {
    addStyles();

    const choice = readChoice();

    if (choice === 'granted') {
      loadAnalytics();
      showSettingsButton();
      return;
    }

    if (choice === 'denied') {
      denyAnalytics();
      showSettingsButton();
      return;
    }

    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
