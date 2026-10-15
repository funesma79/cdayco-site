// Menú principal en móvil y tablet (A11Y-NAV-01).
// Patrón de navegación desplegable (disclosure), no diálogo modal: el botón controla el panel con
// aria-expanded y la visibilidad la gestiona base.css a partir de la clase is-open.
(() => {
  const nav = document.getElementById('primary-nav');
  const toggle = document.getElementById('menu-toggle');
  if (!nav || !toggle) return;

  const isOpen = () => nav.classList.contains('is-open');

  // Si el banner de cookies está visible, reserva su altura al pie del panel para que no tape enlaces.
  const reserveConsentSpace = () => {
    const banner = document.getElementById('cda-consent');
    const top = banner ? banner.getBoundingClientRect().top : window.innerHeight;
    nav.style.setProperty('--nav-consent-space', Math.max(0, Math.round(window.innerHeight - top)) + 'px');
  };

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) reserveConsentSpace();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));

  // Escape cierra el menú y, si el foco estaba en él, lo devuelve al botón.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    const focusInside = document.activeElement === toggle || nav.contains(document.activeElement);
    setOpen(false);
    if (focusInside) toggle.focus();
  });

  // Si el foco sale del botón y del menú, el menú se cierra: ningún foco queda tapado por el panel.
  document.addEventListener('focusin', (e) => {
    if (isOpen() && e.target !== toggle && !nav.contains(e.target)) setOpen(false);
  });

  // En escritorio el menú no es desplegable: no conservar un estado abierto al cambiar de ancho.
  const mobile = window.matchMedia('(max-width: 900px)');
  if (mobile.addEventListener) mobile.addEventListener('change', () => { if (!mobile.matches) setOpen(false); });

  window.addEventListener('resize', () => { if (isOpen()) reserveConsentSpace(); });
  new MutationObserver(() => { if (isOpen()) reserveConsentSpace(); }).observe(document.body, { childList: true });
})();
