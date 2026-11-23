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

## Pendientes Técnicos

| Severidad | Estado | Ítem |
|---|---|---|
| 🟢 | ✅ | Botón de pista (💡) duplicado en la barra del editor (implementado en Bloque 1: `#cf-academy-editor-hint` sincronizado con la tarjeta de misión). |
| 🟢 | ❓ | Texto de `#cf-academy-validate` ("Validar nivel") vs. propuesta "▶ Ejecutar y Validar" (requiere 7 locales). |
| 🟡 | ❓ | Verificación visual manual en móvil real (375px) del stepper sticky y el mini-brief. |
| 🟡 | ❓ | 🔶 `backend/code-formatter` (Node) y `backend/app` (FastAPI) solapan auth/pagos: definir backend canónico. |
| 🟡 | ❓ | 🔶 `data/formatter-subscribers.json` versionado con posibles datos personales. |
| 🟢 | ❓ | 🔶 `AGENTS.md`/`GEMINI.md` sin trackear; sin `TRAE.md`; CLAUDE.md referencia `ci.yml` inexistente en workflows. |
