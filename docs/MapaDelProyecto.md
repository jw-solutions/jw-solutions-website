# Mapa del Proyecto — P001 jw-solutions-website

> Tercer archivo de la Tríada Documental (`PlanDeTrabajo.md` + `pendientes.md` + `MapaDelProyecto.md`). Versión 1.0 — 2026-11-18.
> **Pre-ejecución:** consultar este mapa antes de modificar/añadir/eliminar archivos. **Cierre de sesión:** actualizarlo.
> Alcance del escaneo: 621 archivos versionados/no ignorados (`git ls-files -co --exclude-standard`), excluyendo `.git`, `venv`, `__pycache__`, `.pytest_cache` y residuos `.bak`. Archivos agrupados (👥) cuando son familias generadas o repetitivas; se indica su generador.

## 1. Diagrama de flujo general

```
                         ┌───────────────────────── CAPA CONTENIDO ─────────────────────────┐
 content/articles/*.json ─► content/render-article.js + templates/article.template.html ─► blog/<slug>/index.html
 content/articles.json ───► content/publish.js ─► content/publication-manifest.json ─► sitemap.xml
 content/drafts/ ─► scripts/validate-drafts.js ◄─ .github/workflows/draft-preflight.yml
 scripts/generate-weekly-draft.js ◄─ .github/workflows/weekly-blog-publisher.yml (cron)

 content/code-formatter-tips/published/*.json ─┐
 content/code-formatter-tips/syntax-fixes.json ┼─► scripts/code-formatter/build_public.py ─► tools/code-formatter/{tips,fix}/**/index.html
 content/code-formatter-academy/** ────────────┘            │                                   + sitemap-code-formatter.xml + feeds
 config/features-matrix.json ──► (tier free/pro) ───────────┴─► dist-public/ (ignorado) ─► deploy GitHub Pages (CNAME)

                         ┌──────────────── CAPA FRONT-END (Code Formatter) ────────────────┐
 tools/code-formatter/index.html ─► assets/js/tools/code-formatter/*.js (app, editor, formatters, academy-*, i18n+locales*)
                                  ─► assets/css/tools/code-formatter.css ; features.runtime.json (generado)
        └─ services/api.js ──HTTP──► backend/app (FastAPI, Python) ─► DB (Alembic migrations) ─► workers (expiration/imap/outbox)
                                     backend/code-formatter (Node, legado/paralelo) ─► db/*.sql

 Sitio corporativo: index.html + styles.css + script.js + sw.js + site.webmanifest + _headers + 404.html
 Producción backend: deploy/*.service|timer (systemd) ; CI: .github/workflows/*.yml
 Tests: backend/tests (pytest) · tests/code-formatter (node --test + runner.html)
```

## 2. Inventario (Archivo | Capa | Razón de ser | Depende de | Impacta a)

### 2.1 Raíz y gobierno
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `CLAUDE.md` | Gobierno | Contexto técnico/lecciones del proyecto para Claude | Directiva global | Comportamiento de agentes |
| `AGENTS.md`, `GEMINI.md` | Gobierno | Espejos de reglas para Antigravity/Gemini (sin trackear aún) | `CLAUDE.md` | Agentes |
| `.cursorrules` | Gobierno | Reglas para editor Cursor | Directiva global | Editor |
| `README.md` | Docs | Descripción y despliegue del sitio | `scripts/code-formatter/build_public.py` | Onboarding |
| `docs/PlanDeTrabajo.md` | Gobierno | Hoja de ruta macro | — | Reportes |
| `docs/pendientes.md` | Gobierno | Cola táctica con Doble Semáforo | — | Reportes |
| `docs/MapaDelProyecto.md` | Gobierno | Este inventario y matriz | Todo el repo | Pre-ejecución de cambios |
| `docs/JW_SOLUTIONS_PLAN_COMPLETO.md` | Docs | Plan estratégico del negocio/sitio | — | Referencia |
| `docs/proyectos_portafolio.md` | Docs | Portafolio de proyectos | — | Contenido `index.html` |
| `docs/README_DEPLOY.md` | Docs | Guía de despliegue | `deploy/*`, workflows | Operación |
| `.gitignore`, `.gitattributes` | Config | Exclusiones (`dist-public/`, `node_modules/`, `.pw-profile/`, `.claude/`) y normalización EOL | — | Git |
| `.nojekyll`, `CNAME` | Despliegue | GitHub Pages sin Jekyll; dominio `jw-solutions.com` | — | Hosting |
| `_headers` | Seguridad | CSP/cabeceras HTTP | HTML/JS externos | Todas las páginas |
| `robots.txt`, `sitemap.xml`, `sitemap-code-formatter.xml` | SEO | Indexación; el segundo lo genera `build_public.py --sitemap` | `content/*`, `tools/` | Buscadores |
| `d4af37e9…a12.txt` | SEO | Clave de verificación IndexNow | `scripts/ping-indexnow.js` | IndexNow |
| `index.html`, `styles.css`, `script.js` | Front sitio | Landing corporativa | `assets/` | UX/SEO |
| `404.html`, `favicon.ico`, `site.webmanifest`, `sw.js` | Front sitio | Error, iconos, PWA, service worker | `index.html` | Caché/offline |

### 2.2 Contenido (blog y Code Formatter)
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `content/articles/*.json` (4) | Contenido | Fuente de artículos del blog | `articles.json` | `blog/*/index.html` |
| `content/articles.json`, `content/config.json` | Contenido | Índice y configuración editorial | — | `publish.js` |
| `content/publish.js`, `content/render-article.js` | Pipeline | Publica/renderiza artículos | `templates/article.template.html` | `blog/`, `sitemap.xml` |
| `content/publication-manifest.json` | Pipeline | Registro de publicaciones | `scripts/publication-manifest.js` | Sitemap |
| `content/templates/article.template.html`, `content/drafts/{.gitkeep,README.md}` | Contenido | Plantilla y borradores | — | Render, preflight |
| `blog/*/index.html` (4), `blog/blog.css`, `blog/blog.js` | Front blog | Artículos renderizados y su estilo/script | `content/articles` | SEO |
| 👥 `content/code-formatter-tips/published/*.json` (64) | Contenido | Tips publicados multi-idioma | `syntax-fixes.json` | `tools/.../tips/**` |
| `content/code-formatter-tips/{code-formatter-manifest,seo-opportunities,syntax-fixes}.json` | Contenido | Manifiesto, oportunidades SEO, catálogo de errores | — | `build_public.py` |
| 👥 `content/code-formatter-tips/distribution/*` (11) | Distribución | Kits de syndicación | `generate-distribution-kit.js` | Dev.to/Hashnode/social |
| 👥 `content/code-formatter-tips/audits/*` (2) | Docs | Auditorías E2E live | — | Referencia |
| `content/code-formatter-academy/{achievements,daily-challenges,paths}.json` | Contenido | Logros, retos diarios, rutas | — | `academy-*.js` |
| 👥 `content/code-formatter-academy/curriculum/<locale>/<lang>.json` (70) | Contenido | Currículo 7 locales × 10 lenguajes | `validate-academy-curriculum.js` | `academy-engine.js`, tests |

### 2.3 Front-end Code Formatter (`assets/`, `tools/`, `config/`)
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `config/features-matrix.json` | Config | Matriz de funciones free/pro | — | `build_public.py`, `features.runtime.json` |
| `config/documentation-languages.js` | Config | Lenguajes soportados en doc-generator | — | `doc-generator.js` |
| `tools/code-formatter/index.html` | Front | SPA del formateador | `assets/js/*`, css | Usuario final |
| `tools/code-formatter/features.runtime.json` | Generado | Flags de runtime (dev/pública) | `build_public.py` | `app.js` |
| `tools/code-formatter/{cert,embed}/index.html`, íconos | Front | Certificados, widget embebible, favicons | `cert-page.js`, `embed.js` | Verificación/embeds |
| 👥 `tools/code-formatter/tips/**/index.html` (83) + `feed*.xml` | Generado | Landings de tips y feeds | `build_public.py` ← tips JSON | SEO |
| 👥 `tools/code-formatter/fix/**/index.html` (82) | Generado | Landings de errores de sintaxis | `build_public.py` ← `syntax-fixes.json` | SEO |
| `assets/css/tools/code-formatter.css` | Front | Estilos del formateador/academia | — | Todas las vistas |
| `assets/js/.../app.js`, `ui-controller.js`, `editor.js`, `actions.js` | Front | Orquestación UI y editor | `formatters.js`, `detect.js` | Núcleo |
| `…/formatters.js`, `detect.js`, `diagnostics.js`, `diff-view.js`, `history.js`, `share.js` | Front | Formateo, detección, diagnóstico, diff, historial, compartir | — | Núcleo |
| `…/doc-generator.js`, `json-documentation-adapter.js`, `structured-doc-ui.js` | Front | Generación de documentación | `documentation-languages.js` | UI doc |
| `…/academy-{engine,pro,progress,sandbox,ui}.js` | Front | Modo Academia (vista única `paths→tree→editor→results`) | currículo JSON, `i18n.js` | Tests academia |
| `…/auth-modal.js`, `pro-modal.js`, `pro-messages.js`, `newsletter.js`, `services/{api,session-monitor}.js` | Front | Auth, Pro, newsletter, API y sesión | `backend/app` | Flujo comercial |
| `…/cert-page.js`, `fix-page.js`, `tips-page.js`, `tips-carousel.js`, `embed.js` | Front | Páginas auxiliares | `build_public.py` | Landings |
| `…/i18n.js`, `locales/*.js` (7), `locales-pro/*.js` (7) | Front | Internacionalización de/en/es/fr/it/pt-BR/pt-PT | — | Todos los textos (cambiar claves ⇒ 7 locales) |
| 👥 `assets/images/{badges,og}/*` (78), `assets/logo-jw.png`, `assets/og-image.jpg` | Assets | Imágenes y OG | `generate-og-images.js`, `generate-blog-og.js` | SEO/social |

### 2.4 Backend Python (`backend/`)
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `backend/app/main.py` | API | Punto de entrada FastAPI | `api/*`, `core/*` | Servicio `jw-api` |
| `backend/app/api/{auth,session,payments,subscriptions,newsletter,academy}.py` | API | Endpoints REST | `models`, `services`, `security` | Front `services/api.js` |
| `backend/app/core/{config,database,locks,logging}.py` | Core | Config `.env`, DB, locks, logging | `backend/.env` | Todo backend |
| `backend/app/models/*.py` (9) | Datos | Modelos SQLAlchemy | `core/database.py` | `migrations/`, servicios |
| `backend/app/security/{csrf,email_authentication,origin_validation,rate_limit,sessions}.py` | Seguridad | CSRF, SPF/DKIM, origen, rate-limit, sesiones | `core/config.py` | `api/*` |
| `backend/security/passwords.py` | Seguridad | Hash de contraseñas (argon2) | — | `api/auth.py` |
| `backend/app/services/{binance_parser,certificate_service,newsletter_service,notification_service,order_service,payment_matching,subscription_service}.py`, `payment_channels/{__init__,catalog}.py` | Servicios | Lógica de negocio y pagos | `models`, `core` | `api/*`, `workers/*` |
| `backend/app/workers/{expiration_worker,imap_reconciliation,outbox_worker}.py` | Workers | Expiración, conciliación IMAP, outbox | `services`, DB | `deploy/*.service` |
| `backend/migrations/{env.py,script.py.mako}`, `versions/0001…0006_*.py`, `backend/alembic.ini` | Datos | Migraciones Alembic | `models` | Esquema DB |
| `backend/scripts/{__init__,inspect_mailbox,seed_academy_pro}.py` | Utilidad | Inspección buzón y seed academia | `core`, `models` | Operación |
| `backend/{pyproject.toml,requirements.txt,.gitignore}` | Config | Dependencias y exclusiones | — | Entorno |
| `backend/tests/{conftest,test_academy,test_certificates_tiered,test_imap_parser,test_newsletter,test_payment_matching,test_payments_automation,test_workers}.py`, `integration/`, `fixtures/emails/` | Tests | Suite pytest backend | `backend/app` | Calidad |

### 2.5 Backend Node legado (`backend/code-formatter/`)
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `src/{main,app,auth,config,cookies,events,http-utils,mailer,middleware,outbox,passwords,payments,sessions,tokens}.js` | API legado | Servidor Node del Code Formatter | `package.json`, `db/*.sql` | 🔶 Solapa funcionalmente con `backend/app` (auth/pagos); definir cuál es canónico |
| `db/{schema,002_accounts_payments}.sql`, `package.json`, `package-lock.json` | Datos/Config | Esquema y dependencias Node | — | `src/*` |

### 2.6 Scripts, CI y despliegue
| Archivo | Capa | Razón de ser | Depende de | Impacta a |
|---|---|---|---|---|
| `scripts/code-formatter/build_public.py` | Build | Genera `dist-public/`, sitemap, landings `fix/`, runtime flags (`--dev/--sitemap/--fix`) | `features-matrix.json`, content tips | `dist-public/`, `tools/`, sitemap |
| `scripts/code-formatter/validate-academy-curriculum.js` | QA | Valida currículo academia | `content/code-formatter-academy` | CI |
| `scripts/code-formatter/{generate-weekly-tip,generate-og-images,generate-distribution-kit}.js` | Contenido | Generan tips, OG y kits | tips JSON | `content/`, `assets/images/og` |
| `scripts/code-formatter/{syndicate-devto,syndicate-hashnode,syndicate-social}.js`, `browser-syndicate.mjs` | Distribución | Syndicación (usa `.pw-profile/` ignorado) | distribution kits | Canales externos |
| `scripts/code-formatter/{check-deployment,notify-newsletter,ping-indexnow}.js`, `test-growth-loops.mjs` | Operación | Verificación de deploy, newsletter, IndexNow, loops de crecimiento | sitemap, API | Producción |
| `scripts/{check-deployment,generate-blog-og,generate-weekly-draft,notify-newsletter,ping-indexnow,publication-manifest,validate-drafts,validate-formatter-tips}.js` | Operación | Equivalentes del blog/sitio | `content/` | Blog, SEO |
| `tests/code-formatter/{academy,automation,certificates,click-audit}.test.mjs`, `fixtures.js`, `runner.html` | Tests | `node --test` + runner navegador | `assets/js/tools/code-formatter` | Calidad front |
| `.github/workflows/{code-formatter-preflight,code-formatter-syndicate-backfill,code-formatter-tips,draft-preflight,weekly-blog-publisher}.yml` | CI/CD | Preflight, backfill, tips semanales, borradores y blog (cron) | scripts anteriores | `main` / publicación |
| `deploy/{jw-api.service,jw-expiration-worker.service,jw-expiration-worker.timer,jw-imap-worker.service}` | Despliegue | Unidades systemd VPS | `backend/app`, workers | Producción |
| `data/formatter-subscribers.json` | Datos | Suscriptores locales del formateador | `newsletter.js` | 🔶 Datos personales: no exponer |
| `.claude/{launch.json,settings.local.json}` | Herramienta | Config local de Claude (ignorada por Git) | — | Sesión local |

## 3. Matriz de dependencias cruzadas (impacto de cambios)

| Si cambias… | Revisa/ajusta obligatoriamente |
|---|---|
| Claves de `locales/*.js` o `locales-pro/*.js` | Los 7 locales, `i18n.js`, tests `academy.test.mjs`/`click-audit.test.mjs` |
| `content/code-formatter-academy/**` | `validate-academy-curriculum.js`, `academy-engine.js`, `academy.test.mjs`, `seed_academy_pro.py` |
| `config/features-matrix.json` | `build_public.py` (0 `pay`, 0 `data-cf-commercial` en público), `features.runtime.json`, `_headers` |
| `content/code-formatter-tips/**` o `syntax-fixes.json` | Re-ejecutar `build_public.py` (`--fix`, `--sitemap`), `tools/.../tips|fix`, feeds, sitemap |
| `backend/app/models/*` | Nueva migración Alembic, `tests/`, `services/`, `api/` |
| `backend/app/api/*` | `assets/js/.../services/api.js`, `auth-modal.js`, `pro-modal.js`, `_headers` (CSP/origen), tests pytest |
| `backend/app/workers/*` | `deploy/*.service|timer`, `test_workers.py` |
| `_headers` (CSP) | Todos los scripts/estilos externos, `sw.js`, páginas generadas |
| `content/articles/*.json` | `render-article.js`, `blog/`, `publication-manifest.json`, `sitemap.xml` |
| `.github/workflows/*` | Scripts invocados, secretos de GitHub (no versionados) |
| Cualquier archivo/estructura | Actualizar este Mapa + `pendientes.md` + `PlanDeTrabajo.md` al cerrar sesión |

## 4. Archivos sensibles / ignorados (contenido NO documentado)

| Ruta | Estado | Nota |
|---|---|---|
| `backend/.env` | Existe local, ignorado (`backend/.gitignore`) | Credenciales; nunca versionar ni mostrar |
| `.pw-profile/`, `.cache/pw-syndicate-profile/` | Ignorados | Cookies/sesiones de navegador para syndicación |
| `dist-public/` | Ignorado | Artefacto de build; regenerable con `build_public.py` |
| `node_modules/`, `backend/venv/` | Ignorados / fuera de inventario | Dependencias |
| `.claude/` | Ignorado | Configuración local de sesión |
| `data/formatter-subscribers.json` | Versionado | 🔶 Contiene datos de suscriptores; evaluar sacarlo del repo |
| `.git/`, `__pycache__/`, `.pytest_cache/`, `*.bak*` | Excluidos del escaneo | Residuos |

## 5. Novedades detectadas (🔶) al generar el Mapa
- 🔶 `backend/code-formatter/` (Node) y `backend/app/` (FastAPI) implementan auth/pagos en paralelo: confirmar cuál es el backend canónico.
- 🔶 `data/formatter-subscribers.json` versionado con posibles datos personales.
- 🔶 `AGENTS.md` y `GEMINI.md` sin trackear; no existe `TRAE.md` (sin espejo).
- 🔶 Cambios sin commitear en `tools/code-formatter/tips/feed*.xml` (regenerados).
