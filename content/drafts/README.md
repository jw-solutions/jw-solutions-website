# Borradores de artículos

Coloca aquí los borradores (`<slug>.json`) con el mismo formato que `content/articles/*.json`.
Esta carpeta no se publica: el renderizador solo toma fuentes de `content/articles/`.

Flujo:

1. Crear `content/drafts/<slug>.json`.
2. Al aprobarlo, moverlo a `content/articles/` y ejecutar `node content/render-article.js <slug>`.
3. Añadir su entrada a `content/articles.json` y a `sitemap.xml`.
4. Si hay más de `featured.max` artículos destacados (ver `content/config.json`), pasar el más antiguo a `"status": "archived"`.
