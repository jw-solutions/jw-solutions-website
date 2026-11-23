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

## Pendientes Técnicos

| Severidad | Estado | Ítem |
|---|---|---|
| 🟢 | ✅ | Botón de pista (💡) duplicado en la barra del editor (implementado en Bloque 1: `#cf-academy-editor-hint` sincronizado con la tarjeta de misión). |
| 🟢 | ❓ | Texto de `#cf-academy-validate` ("Validar nivel") vs. propuesta "▶ Ejecutar y Validar" (requiere 7 locales). |
| 🟡 | ❓ | Verificación visual manual en móvil real (375px) del stepper sticky y el mini-brief. |
| 🟡 | ❓ | 🔶 `backend/code-formatter` (Node) y `backend/app` (FastAPI) solapan auth/pagos: definir backend canónico. |
| 🟡 | ❓ | 🔶 `data/formatter-subscribers.json` versionado con posibles datos personales. |
| 🟢 | ❓ | 🔶 `AGENTS.md`/`GEMINI.md` sin trackear; sin `TRAE.md`; CLAUDE.md referencia `ci.yml` inexistente en workflows. |
