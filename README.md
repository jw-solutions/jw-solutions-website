# JW Solutions — Plataforma Web & Code Formatter & Auto-Doc AI

[![Code Formatter & Auto-Doc AI](https://img.shields.io/badge/Code%20Formatter%20%26%20Auto--Doc%20AI-7%20Idiomas-0ea5e9?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://jw-solutions.com/tools/code-formatter/?utm_source=github_readme&utm_medium=main_repo)
[![Sitio Oficial](https://img.shields.io/badge/Web-jw--solutions.com-0f172a?style=for-the-badge)](https://jw-solutions.com)

Repositorio oficial del ecosistema web de **[JW Solutions](https://jw-solutions.com)** y su suite gratuita de ingeniería **[Code Formatter & Auto-Doc AI](https://jw-solutions.com/tools/code-formatter/?utm_source=github_readme&utm_medium=main_repo)** (formateo, documentación automática y análisis de código en 10 lenguajes y 7 idiomas: `es`, `en`, `pt-BR`, `pt-PT`, `fr`, `de`, `it`).

---

## Mapa de Arquitectura

```text
├── index.html, *.html          # Frontend estático Jamstack (Cloudflare Pages / CDN Edge)
├── tools/code-formatter/       # App Code Formatter & Auto-Doc AI + Tips localizados (7 idiomas)
├── backend/                    # API FastAPI + PostgreSQL (newsletter, pagos, analítica, /health)
├── content/
│   ├── blog/                   # Artículos del Blog Semanal (ES / EN) + manifiesto
│   └── code-formatter-tips/    # Tips bi-semanales (Martes/Jueves) + manifiesto + kits de distribución
├── scripts/
│   ├── code-formatter/         # Generación IA (Gemini), OG images (resvg), build_public.py, sindicación
│   ├── validate-formatter-tips.js
│   └── publication-manifest.js
├── tests/                      # Suites de pruebas (Node test runner + pytest)
└── .github/workflows/          # Pipelines CI/CD: Blog Semanal y Code Formatter Tips
```

### Componentes Principales

1. **Frontend Jamstack + Cloudflare**
   - Sitio corporativo estático de alto rendimiento con soporte multi-idioma, cabeceras de seguridad (CSP, HSTS, X-Frame-Options) y Subresource Integrity (SRI) en activos CDN versionados.
   - Módulo interactivo **Code Formatter & Auto-Doc AI** con páginas estáticas compiladas en 7 idiomas, feeds RSS por idioma y sitemaps dedicados (`sitemap-code-formatter.xml`).

2. **Backend FastAPI / PostgreSQL (`backend/`)**
   - Servicio systemd (`jw-api.service`) desplegado detrás de reverse proxy en `https://api.jw-solutions.com`.
   - Endpoints para gestión de suscriptores de newsletter, broadcast por canal (`code-formatter`), verificación de salud (`/health`) y pasarela de servicios.
   - Protegido con límites preventivos de memoria en `systemd` (`MemoryHigh=512M`, `MemoryMax=768M`).

3. **Pipelines Automatizados en GitHub Actions (`.github/workflows/`)**
   - **Blog Semanal (`publish.js`)**: Validación, compilación y despliegue continuo de artículos técnicos.
   - **Code Formatter Tips (`code-formatter-tips.yml`)**: Orquestación bi-semanal (Martes y Jueves 14:00 UTC) con ciclo idempotente (`COMPILED` → `DEPLOYED` → `NOTIFIED`):
     - Generación asistida por IA y validación estructural.
     - Renderizado de imágenes OpenGraph en 7 idiomas (`generate-og-images.js`).
     - Compilación estática multi-idioma y actualización de sitemap (`build_public.py`).
     - Verificación HTTP 200 en producción, ping a IndexNow, sindicación canónica (Dev.to, Hashnode) y difusión social (Bluesky, Mastodon, Telegram, Discord, GitHub Discussions).
     - Modo `retry_social_only` para reintentar difusión y sindicación sin regenerar contenido ni reenviar newsletter.

---

## Validación y Pruebas Locales

```bash
node --test tests/code-formatter/automation.test.mjs
node scripts/code-formatter/test-growth-loops.mjs
node scripts/validate-formatter-tips.js
node scripts/publication-manifest.js verify
node content/publish.js --check
```
