# QA remoto de A11Y-NAV-01 (rama temporal `qa/a11y-nav-01-remote`)

Esta rama sirve **solo** para ejecutar en la nube las fases B y C pendientes de la corrección de accesibilidad del menú móvil. **No se fusiona en `main`.** El cambio que se integrará está en la rama `fix/a11y-nav-01`.

## Contenido de la rama

- **Commit 1:** el candidato. Es una copia exacta del árbol auditado de `fix/a11y-nav-01`: 41 ficheros (`base.css`, `nav.js` nuevo y 39 HTML), sobre la base `1c6321fc029890e7c780310086f86424fb33a0dd`.
- **Commit 2:** esta carpeta y `.github/workflows/qa-a11y-nav-01.yml`:
  - `EXPECTED.json`: los blobs git de los 41 ficheros auditados. El runner se niega a probar si no coinciden o si hay otros cambios en el sitio.
  - `run-remote.mjs`: integridad, baseline (worktree temporal en la base), servidor local, auditoría SEO y fases B y C (un Chromium por lote, con guardián de memoria; se puede reanudar).
  - `a11y-nav-suite-v3.mjs`: la suite CDP (fases A, B y C), sin dependencias.
  - `compare.mjs`: compara con el baseline y da el veredicto (código de salida 0 = PASS).
  - `harness/server.mjs` y `harness/seo-audit.mjs`: servidor local en `127.0.0.1:8766` con CSP y auditoría SEO.
  - `pages.txt`: las 42 páginas.

Requisitos: Node ≥ 22, Chrome o Chromium, git con acceso al commit base, y los puertos 8766 y 9333 libres. No hace falta `npm install`.

## Opción A: GitHub Actions (recomendada)

1. Publicar la rama: `git push -u origin qa/a11y-nav-01-remote`. Ese push dispara el workflow.
2. En GitHub → Actions → «QA A11Y-NAV-01 (temporal)», esperar al job, que tarda unos 20–30 minutos.
3. Descargar el artefacto `qa-a11y-nav-01-results`. `SUMMARY.json` trae el veredicto y `run.log`, `integrity.json`, `seo_*.json`, los JSON por lote y `shots/`, el detalle.
4. El job falla si se rompe la integridad, si Chrome no arranca o si `compare.mjs` no da PASS.

## Opción B: Codex Cloud u otro runner Linux

```bash
git clone https://github.com/funesma79/cdayco-site.git && cd cdayco-site
git checkout qa/a11y-nav-01-remote
git fetch origin 1c6321fc029890e7c780310086f86424fb33a0dd   # si el clon es superficial
# Chrome: si el entorno no lo trae, instalarlo en el script de preparación, p. ej.:
#   apt-get update && apt-get install -y chromium   (o google-chrome-stable)
node qa-remote/run-remote.mjs --verify-only
node qa-remote/run-remote.mjs --dry-run
CHROME="$(command -v chromium || command -v google-chrome)" EXTRA_CHROME_ARGS="--no-sandbox" node qa-remote/run-remote.mjs
node qa-remote/compare.mjs; echo "veredicto rc=$?"
```

Se devuelve `qa-remote/results/` (o al menos `SUMMARY.json`, `run.log` e `integrity.json`). En Codex Cloud, la instalación de Chrome debe ir en el *setup script* del entorno, que tiene red. Durante la ejecución no hace falta red.

## Resultados esperados (`dry-run`)

- Candidato: `/nav.js` 200. Baseline: `/nav.js` 404.
- SEO en ambos: 42 páginas, 1.018 enlaces, 0 rotos, 3 avisos canonical preexistentes, 0 hreflang.

## Criterios de aprobación

- **Fase B** (2 ES, 2 EN y 2 ZH a 390 y 820 px, más `prefers-reduced-motion`), 15 casos sin fallos:
  - abrir y cerrar con clic, toque, Enter y Espacio;
  - Escape con devolución del foco;
  - Tab y Shift+Tab con foco visible;
  - la X pulsable también durante la animación;
  - `aria-expanded`, visibilidad y árbol de accesibilidad sincronizados;
  - el banner de cookies sin tapar enlaces y operativo;
  - sin desplazamiento horizontal, sin errores de consola ni CSP.
- **Fase C** (42 páginas a 390, 820 y 1440 px; 126 casos):
  - la secuencia de Tab del candidato es igual a la del baseline sin las paradas del menú cerrado, e idéntica a 1440 px;
  - 0 paradas en el menú cerrado y desplazamiento horizontal 0;
  - 0 errores de consola y 0 CSP;
  - la prueba corta del menú sin fallos y el menú de escritorio intacto.
- **SEO** idéntico al baseline.
- Las capturas distintas son informativas: hay ruido de carga.

**Fallo conocido y preexistente:** el banner de cookies puede tapar contenido enfocado de la página («foco tapado tras salir del menú»). Si aparece, hay que confirmar que lo tapa `#cda-consent`; es un defecto del banner, no de este cambio.

## Efectos del push que hay que conocer

- Vercel creará probablemente un **deployment de Preview** de esta rama: es el sitio candidato más esta carpeta, servidos como ficheros estáticos. No afecta a producción.
- Publicar `.github/workflows/` exige un token con permiso `workflow`.
- Al terminar, borrar la rama remota `qa/a11y-nav-01-remote`, con autorización.
