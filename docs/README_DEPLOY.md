# Guía de Despliegue, Resiliencia y Recuperación ante Desastres (DR) — `P001-jw-solutions-website`

> **Última actualización:** 2026-11-23  
> **Dominio Público (Frontend):** `https://jw-solutions.com` (GitHub Pages / Cloudflare CDN)  
> **API Backend (Producción):** `https://api.jw-solutions.com` → VPS `107.172.159.114` (`segubot-vps`, `/opt/jw-solutions/backend/`)

---

## 1. Arquitectura de Despliegue y Separación Público / Privado

1. **Frontend Estático y Build Público (`dist-public/`):**
   - La raíz del repositorio sirve la landing corporativa (`index.html`), las rutas legales públicas (`/privacidad/` y `/terminos/`), el blog (`/blog/**`) y la herramienta Code Formatter (`/tools/code-formatter/`).
   - El compilador `python -B scripts/code-formatter/build_public.py` genera `dist-public/` filtrando `config/features-matrix.json` para garantizar **`0` archivos `tier: "pay"`** y **`0` nodos HTML `data-cf-commercial`**.
   - **Limitación de Cabeceras en GitHub Pages:** GitHub Pages no procesa el archivo `_headers` (usado por Cloudflare Pages / Netlify). Por ello, todas las páginas HTML críticas (`index.html`, `tools/code-formatter/index.html`, `/privacidad/`, `/terminos/`, `/tips/**`, `/fix/**`) declaran su directiva `Content-Security-Policy` también mediante `<meta http-equiv="Content-Security-Policy">` y protección anti-clickjacking.

2. **Backend Canónico (`backend/app/` — FastAPI + PostgreSQL):**
   - **Estado Arquitectónico:** `backend/app/` (FastAPI, Python 3.12, SQLAlchemy 2 + Alembic) es el **único backend canónico en producción**.
   - El directorio `backend/code-formatter/` (Node.js) se conserva únicamente como referencia histórica/legada y **no** se despliega en el VPS.
   - **Servicios `systemd` activos en el VPS (`107.172.159.114`):**
     - `jw-api.service`: Uvicorn en `127.0.0.1:8081` (`MemoryHigh=512M`, `MemoryMax=768M`, `ProtectSystem=strict`, `NoNewPrivileges=true`).
     - `jw-imap-worker.service`: Conciliación IMAP de recibos y notificaciones.
     - `jw-expiration-worker.service` + `jw-expiration-worker.timer`: Expiración de órdenes/suscripciones y saludo anual de cumpleaños idempotente.

---

## 2. Compuertas de Pre-Despliegue (Obligatorias)

Ningún commit o despliegue a `main` puede ejecutarse sin aprobar las 6 compuertas locales y en GitHub Actions (`.github/workflows/ci.yml`):

```bash
node scripts/code-formatter/validate-academy-curriculum.js
node scripts/validate-formatter-tips.js
node --test tests/code-formatter/*.test.mjs
node scripts/code-formatter/test-growth-loops.mjs
pytest backend/tests --ignore=backend/tests/integration -q
python -B scripts/code-formatter/build_public.py
```

---

## 3. Resiliencia, Backups (`RTO` / `RPO`) y Rollback Rápido (`< 3 min`)

### 3.1 Objetivos de Recuperación (SLOs de Continuidad)
- **RPO (Recovery Point Objective):** `≤ 24 horas` para base de datos PostgreSQL (volcado diario automatizado comprimido `pg_dump -Fc` en `/var/backups/postgresql/` con retención rotativa y copia previa antes de cada migración Alembic). El currículo Pro (`210` niveles en 7 locales) es 100% determinista y regenerable en `< 10 s` mediante `python -m scripts.seed_academy_pro`.
- **RTO (Recovery Time Objective):** `≤ 3 minutos` ante fallo de despliegue de código o migración.

### 3.2 Procedimiento de Rollback en `< 3 minutos` (VPS `107.172.159.114`)

1. **Rollback de Código Backend (Tiempo estimado: 45 segundos):**
   ```bash
   cd /opt/jw-solutions/backend
   sudo -u jwsolutions git log -n 3 --oneline
   sudo -u jwsolutions git checkout <COMMIT_ESTABLE_ANTERIOR>
   sudo systemctl restart jw-api.service jw-imap-worker.service
   curl -fsS http://127.0.0.1:8081/health
   ```
2. **Rollback de Esquema de Base de Datos (si la versión incluía migración Alembic):**
   ```bash
   cd /opt/jw-solutions/backend
   sudo -u jwsolutions /opt/jw-solutions/backend/.venv/bin/alembic downgrade -1
   sudo systemctl restart jw-api.service
   ```
3. **Rollback de Frontend Estático (GitHub Pages):**
   ```bash
   git revert --no-edit HEAD
   git push origin main
   ```
