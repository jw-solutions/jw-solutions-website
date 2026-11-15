# Auditoría Forense E2E en Vivo — Code Formatter Tips (`2026-11-15`)

- **Proyecto:** `P001-jw-solutions-website` (`https://jw-solutions.com`)
- **Workflow:** `.github/workflows/code-formatter-tips.yml`
- **Artículo Generado (`<NUEVO_SLUG>`):** `php-83-typed-properties-enums-psr12-refactoring`
- **Lenguaje / Categoría:** `php` / `Tips de Sintaxis | Buenas prácticas | Auto-Doc AI`
- **Estado Final en Manifiesto:** `NOTIFIED`
- **Commit del Fix Previo (Fallo Bloqueante):** `e98e235`
- **Commit del Despliegue Automático:** `0717501`

---

## 1. Resumen de Semáforos (Estándar JW-Solutions)

| Fase / Componente | Progreso | Severidad | Evidencia / Resultado |
| :--- | :---: | :---: | :--- |
| **F1.1** Run inicial (`43743989600`) | ⚠️ | 🟡 | Fallo bloqueante en IA (`gemini-3.8-flash` timeout 180s; `3.6-flash` <350 palabras; `3.5-flash-lite` HTTP 503). |
| **F1.2** Reintento (`43746818829`) | ⚠️ | 🟡 | Confirmó fallo bloqueante (`3.8-flash` timeout; `3.6-flash` 321-336 palabras; `3.5-flash-lite` 331-349 palabras). |
| **F1.3** Fix quirúrgico (`e98e235`) + Run (`43747856413`) | ✅ | 🟢 | Exitoso: Job principal `6m23s` + Job Newsletter `18s`. Generado con `gemini-3.5-flash-lite` (2/2) tras fallbacks. |
| **F2.1** 7 URLs estáticas localizadas | ✅ | 🟢 | `200 OK` en `es`, `en`, `pt-BR`, `pt-PT`, `fr`, `de`, `it`. |
| **F2.2** 7 tarjetas OpenGraph (`1200x630`) | ✅ | 🟢 | `200 OK` en los 7 PNGs bajo `/assets/images/og/tips/`. |
| **F2.3** Sitemap y Feeds RSS | ✅ | 🟢 | `200 OK` sin bloqueo Cloudflare; `sitemap-code-formatter.xml`, `feed.en.xml` y `feed.es.xml` contienen el slug. |
| **F2.4** IndexNow | ✅ | 🟢 | Ping registrado: `2026-11-15T18:44:23.699Z`. |
| **F3.1** PostgreSQL `newsletter_deliveries` | ✅ | 🟢 | 3 registros (`id` 21, 22, 23) con `status='sent'`, `error_message=NULL`, `sent_at=2026-11-15 18:44:41.448928+00`. |
| **F3.2** PostgreSQL `newsletter_subscribers` | ✅ | 🟢 | 3 suscriptores `active` bajo `channel='code-formatter'`. |
| **F3.3** VPS Salud & RAM (`segubot-vps`) | ✅ | 🟢 | `jw-api.service` `active`, `segubot.service` `active`, `/health` `{"status":"ok"}`, RAM usada `765/3915 MB` (`3149 MB` disponible). |
| **F4.1** Dev.to | ✅ | 🟢 | `200 OK`; `canonical_url` apunta a `.../php/php-83-typed-properties-enums-psr12-refactoring/en/`. |
| **F4.2** Discord | ✅ | 🟢 | `status: "published"`, `messageId: "1571596759447117918"`. |
| **F4.3** GitHub Discussions | ✅ | 🟢 | `200 OK` en `discussions/21` (`id: "D_kwDOSheTeM4ArK6T"`). |
| **F4.4** Hashnode | ⚠️ | 🟢 | Omitido por plan: `::warning::Hashnode GraphQL API devolvió respuesta no-JSON (requiere plan Pro)`. |
| **F4.5** Bluesky & Telegram | ⚠️ | 🟡 | Emitieron `::warning::`: Bluesky `HTTP 401` (auth) y Telegram `HTTP 400` (en histórico de backlog/conector). |
| **F4.6** Kit de Distribución | ⚠️ | 🟢 | `php-83-typed-properties-enums-psr12-refactoring.json` creado; `READY_TO_POST_ALL_6_ARTICLES.md` es compendio estático previo (no auto-actualizado). |

---

## 2. Fase 1 — Tiempos, Modelos y Hallazgos de Ejecución

### Fallo Bloqueante Detectado y Resuelto
- **Runs fallidos:** `43743989600` (8m15s) y `43746818829` (8m32s).
- **Causa raíz:** `gemini-3.8-flash` excedía el timeout de 180s por razonamiento por defecto al generar los 7 idiomas en un único JSON; `gemini-3.6-flash` y `gemini-3.5-flash-lite` respondían bajo el umbral de 350 palabras (306–349 palabras) en algún locale.
- **Fix aplicado (`e98e235`):** En `scripts/code-formatter/generate-weekly-tip.js` se configuró `thinkingConfig: { thinkingLevel: 'low' }` para `gemini-3.8-flash`, `maxOutputTokens: 16384`, y rango objetivo `480–620` palabras en el prompt (manteniendo `MIN_WORDS = 350`).

### Ejecución Exitosa (`43747856413`)
- **Inicio:** `2026-11-15T18:38:10Z`
- **Job 1 (`Generar, compilar y desplegar tip`):** `6m23s`
  - `gemini-3.8-flash` (1/2): timeout 180s; (2/2): HTTP 503.
  - `gemini-3.6-flash` (1/2): `de` con 342 palabras (<350); (2/2): JSON malformado.
  - `gemini-3.5-flash-lite` (1/2): JSON con caracteres extra al final; (2/2): **SUCCESS** (`2026-11-15T18:43:48.801Z`).
  - `deployed_at`: `2026-11-15T18:44:23.047Z`
  - `indexnow_pinged_at`: `2026-11-15T18:44:23.699Z`
- **Job 2 (`Notificar suscriptores (canal code-formatter)`):** `18s`
  - `notified_at`: `2026-11-15T18:44:49.511Z`

---

## 3. Fase 2 — Verificación HTTP en Producción (`https://jw-solutions.com`)

### 7 URLs Estáticas Localizadas
- `es`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/es/`
- `en`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/en/`
- `pt-BR`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/pt-BR/`
- `pt-PT`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/pt-PT/`
- `fr`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/fr/`
- `de`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/de/`
- `it`: `200` — `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/it/`

### 7 Tarjetas OpenGraph (`1200x630`)
- `es`..`it`: Todas `200` en `https://jw-solutions.com/assets/images/og/tips/php-83-typed-properties-enums-psr12-refactoring-{es,en,pt-BR,pt-PT,fr,de,it}.png`

### Sitemap & RSS
- `https://jw-solutions.com/sitemap-code-formatter.xml`: `200` (`contains_slug=True`)
- `https://jw-solutions.com/tools/code-formatter/tips/feed.en.xml`: `200` (`contains_slug=True`)
- `https://jw-solutions.com/tools/code-formatter/tips/feed.es.xml`: `200` (`contains_slug=True`)

---

## 4. Fase 3 — Auditoría PostgreSQL, Servicios y RAM en VPS (`107.172.159.114`)

- **`newsletter_deliveries` (`article_slug = 'php-83-typed-properties-enums-psr12-refactoring'`):**
  - `id=23`, `status='sent'`, `error_message=None`, `sent_at=2026-11-15 18:44:41.448928+00`
  - `id=22`, `status='sent'`, `error_message=None`, `sent_at=2026-11-15 18:44:41.448928+00`
  - `id=21`, `status='sent'`, `error_message=None`, `sent_at=2026-11-15 18:44:41.448928+00`
- **`newsletter_subscribers` (`channel = 'code-formatter'`):** `3` suscriptores con `status = 'active'`.
- **Servicios:** `jw-api.service` = `active`, `segubot.service` = `active`.
- **API Health:** `https://api.jw-solutions.com/health` → `{"status":"ok"}`.
- **Memoria RAM (`free -m`):** `3915 MB` total | `765 MB` used | `1005 MB` free | `2437 MB` buff/cache | `3149 MB` available | Swap `1/2047 MB`.

---

## 5. Fase 4 — Sindicación Multicanal

- **Dev.to:** `HTTP 200` en `https://dev.to/jwsolutions/php-83-and-psr-12-refactoring-legacy-code-with-typed-properties-and-enums-48p4` — `<link rel="canonical">` verificado hacia `https://jw-solutions.com/tools/code-formatter/tips/php/php-83-typed-properties-enums-psr12-refactoring/en/`.
- **Discord:** `status: "published"`, `messageId: "1571596759447117918"`.
- **GitHub Discussions:** `HTTP 200` en `https://github.com/jw-solutions/jw-solutions-website/discussions/21` (`#21`).
- **Hashnode:** Omitido (`::warning::` — GraphQL API requiere plan Pro).
- **Bluesky / Telegram:** `::warning::` en logs (`Bluesky auth HTTP 401`, `Telegram HTTP 400`).
- **Distribución:** `content/code-formatter-tips/distribution/php-83-typed-properties-enums-psr12-refactoring.json` generado y versionado.
