# Pendientes — P001 jw-solutions-website

> Progreso: ✅ ⚠️ ⏳ 🧊 ❓ — Severidad técnica (solo en "Pendientes Técnicos"): 🔴 Crítica | 🟡 Media | 🟢 Baja — 🔶 NOVEDAD.

## Tareas

- [x] ✅ Generar `docs/MapaDelProyecto.md` v1.0 (Tríada Documental) — 2026-11-18
- [x] ✅ Refactor Modo Academia a Vista Única Secuencial (`paths → tree → editor → results`) — 2026-11-18
- [x] ✅ Corrección del evaluador remedial (criterios propios del drill + restauración del reto principal) — 2026-11-18
- [x] ✅ Slot de Diff View visible en Academia (`#cf-academy-diff-slot`) — 2026-11-18
- [x] ✅ Bloque 1: Botones de compartir social en `/tips/`, `/fix/` y modal del carrusel — 2026-11-22
- [x] ✅ Bloque 1: Bloqueo secuencial estricto en Árbol de Habilidades + fluidez y corrección de 4 bugs en Modo Academia — 2026-11-22
- [x] ✅ Bloque 2: Integración PayPal End-to-End (config, Orders v2, comisiones Decimal, capture, webhook firmado, modal PRO + 7 locales + tests) — 2026-11-22
- [x] ✅ Bloque 3: Loaders por Nicho (A/B/C), Defensas Anti-Scraping/Honeypots, Monetización Indirecta y Telemetría — 2026-11-22
- [x] ✅ Exportación PAYPAL_* al VPS (`paypal_checkout` live activo) + Correos de Bienvenida y Cumpleaños Opcional (migración 0007 + plantillas Dark Glass Gold) — 2026-11-23
- [x] ✅ Bloqueo secuencial real en Academia (incl. niveles Pro), guía tutorial colapsable + toggle asistencia + aviso inactividad en Editor, rediseño cards Planes PRO y pestaña PayPal siempre visible (local validado, pendiente de commit/push/deploy) — 2026-11-23
- [x] ✅ Bloque A: Cimientos Pedagógicos (esquema curricular v2 + validador), enriquecimiento Data & BI (7 locales), limpieza i18n y ampliación `evaluateStyleRules()` localizado — 2026-11-23
- [x] ✅ Bloque B: Experiencia Autodidacta en el Editor (panel tutorial en 4 pestañas sin spoilers, atajos de intención rápida y modo "Practicar con mi código" Antes vs. Después en 7 locales) — 2026-11-23
- [x] ✅ Bloque C: Ejecución WASM en Cliente (`sql.js`/`Pyodide` bajo demanda + SRI real + `_headers`/`index.html` CSP), conexión `fetchProLevel()` en `selectLevel()`, `seed_academy_pro.py` en 7 locales (210 niveles) y `MemoryHigh=512M`/`MemoryMax=768M` en `deploy/jw-api.service` — 2026-11-23
- [x] ✅ Fix `#cf-academy-diff` en Academia y móvil 375px (panel visible antes de `MergeView`, `measureDiff()`, fallback DOM seguro, manejo `isRemedialActive` y CSS móvil `min-height`) — 2026-11-23
- [x] ✅ Ventana flotante temporal móvil (`<=640px`) para `#cf-diff-panel` con backdrop Dark Glass Gold, `Escape` y cierre automático al elegir opción — 2026-11-23
- [x] ✅ Corrección de hallazgos críticos de Auditoría Doble Mirada (API `getJson`/sync/Pro `cf:lang`, Sandbox CSP + timeouts WASM, preservación buffer Formateador, móvil 375px + foco diff + ARIA árbol y pedagogía v2 en 12 niveles restantes × 7 locales) — 2026-11-23
- [x] ✅ Auditoría Pre-Lanzamiento, Commit/Push a `origin/main` y Despliegue en VPS (`107.172.159.114`, `seed_academy_pro.py` 7 locales y verificación HTTP live) — 2026-11-23
- [x] ✅ Cierre de Alertas de Auditoría Corporativa 10/10 (`.github/workflows/ci.yml`, coherencia comercial/legal en 7 locales + rutas `/privacidad` y `/terminos`, saneamiento `formatter-subscribers.json`, `validate-formatter-tips.js`, `docs/README_DEPLOY.md` y Tríada/RAG) — 2026-11-23
- [x] ✅ Limpieza y Reindexación RAG (`MemPalace`) Pre-Commit (`repository_tree.txt`, `README_DEPLOY.md`, Tríada Documental y `ci.yml` en UTF-8 limpio) — 2026-11-23
- [x] ✅ Commit selectivo, Push a `origin/main` y Verificación Controlada en VPS (`107.172.159.114`) y HTTPS en vivo — 2026-11-23
- [x] ✅ Rediseño Híbrido `jw-solutions.com` en local (Base Orion Innovation + Vitrina Editorial Android Authority en `styles.css`, `index.html` y `script.js`; respaldos `.bak`, fix WCAG `#5C4000`, CSP hash intacto, 0 `innerHTML`, 6 compuertas CI + smoke test HTTP 18/18 OK) — 2026-11-28
- [x] ✅ Commit selectivo, push a `origin/main` y verificación HTTPS en producción (`https://jw-solutions.com/`) autorizados por [J] — 2026-11-28

## Pendientes Técnicos

| Severidad | Estado | Ítem |
|---|---|---|
| 🟢 | ✅ | Botón de pista (💡) duplicado en la barra del editor (implementado en Bloque 1: `#cf-academy-editor-hint` sincronizado con la tarjeta de misión). |
| 🟢 | ❓ | Texto de `#cf-academy-validate` ("Validar nivel") vs. propuesta "▶ Ejecutar y Validar" (requiere 7 locales). |
| 🟡 | ❓ | Verificación visual manual en móvil real (375px) del stepper sticky y el mini-brief. |
| 🟡 | ✅ | 🔶 `backend/app` (FastAPI Python) definido y documentado en `docs/README_DEPLOY.md` y `docs/MapaDelProyecto.md` como único backend canónico en producción; `backend/code-formatter` (Node) queda solo como referencia histórica/legada. |
| 🟡 | ✅ | 🔶 `data/formatter-subscribers.json` saneado (`deprecated: true`, `subscribers: []`, política `NO_PII_IN_GIT`, historial verificado con 0 PII; suscripciones 100% en PostgreSQL `newsletter_subscribers`). |
| 🟢 | ✅ | 🔶 Creado `.github/workflows/ci.yml` exigido por `CLAUDE.md` y `.cursorrules`; creado `docs/README_DEPLOY.md`; enlaces legales y rutas `/privacidad/` y `/terminos/` activas. |
| 🟡 | ✅ | 🔶 `MemPalace` (`wing=proyectos`, `room=websites`): purgados los 3 cajones principales corruptos de `repository_tree.txt` (UTF-16LE de `D:\PROYECTOS\MetaAgenteLocal\repository_tree.txt`) y 4 cajones obsoletos de `README_DEPLOY.md` (`2026-05-18`), e indexada la documentación vigente de `P001` en 6 cajones UTF-8 limpios en `room="websites"`. |
