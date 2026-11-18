# Plan de Trabajo — P001 jw-solutions-website

> Fuente de verdad del estado general. Semáforo de progreso: ✅ Completado | ⚠️ Atención | ⏳ En proceso | 🧊 Pausado | ❓ Por definir. 🔶 NOVEDAD = desviación detectada.

## Registro de avances

| Fecha | Frente | Estado | Detalle |
|---|---|---|---|
| 2026-11-18 | Gobierno · Tríada Documental | ✅ | Primera versión de `docs/MapaDelProyecto.md` (621 archivos, diagrama, matriz de dependencias, sensibles). Regla de pre-ejecución y cierre activa. |
| 2026-11-18 | Code Formatter · Modo Academia a Vista Única Secuencial (`paths → tree → editor → results`) | ✅ | Máquina de estados `setAcademyView` en `academy-ui.js`; stepper unificado escritorio/móvil; URL con `&step=`; `cf:lang` conserva paso, nivel y código; reglas `[hidden]` explícitas en CSS; 7 locales con claves nuevas. |
| 2026-11-18 | Code Formatter · Slot de Diff View en Academia | ✅ | `#cf-diff-panel` se reubica en `#cf-academy-diff-slot` al abrir el diff desde Academia y vuelve al Formateador al cambiar de modo. |
| 2026-11-18 | Code Formatter · Evaluador remedial | ✅ | El micro-ejercicio se evalúa contra sus propios criterios (`expected_pattern`), sin contar como intento del nivel principal; al aprobar se restaura el nivel y el código previo en el editor. |
| 2026-11-18 | QA | ✅ | `validate-academy-curriculum.js`, `node --test tests/code-formatter/*.test.mjs` y `build_public.py` (0 pay, 0 `data-cf-commercial`). |

## Notas
- 🔶 NOVEDAD: este proyecto no tenía `docs/PlanDeTrabajo.md`, `docs/pendientes.md` ni `TRAE.md`; se crean los dos primeros. `TRAE.md` no existe, por lo que no hay espejo que sincronizar.
