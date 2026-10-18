# Borradores de artículos

Esta carpeta no se publica. Cada borrador es un archivo `<slug>.json` (el nombre del archivo es el slug:
minúsculas, números y guiones). El motor `content/publish.js` solo toma los que tienen `"status": "ready"`.

## Formato

```json
{
  "status": "draft",
  "tag": "Automatización",
  "es": {
    "title": "Título",
    "description": "Meta descripción (SEO).",
    "excerpt": "Extracto para la tarjeta de la portada.",
    "body": [
      { "h": "Subtítulo", "p": ["Párrafo."], "ul": ["Elemento 1", "Elemento 2"] }
    ]
  },
  "en": { "title": "...", "description": "...", "excerpt": "...", "body": [ { "h": "...", "p": ["..."] } ] }
}
```

Cada sección del `body` admite `h` (subtítulo) y las listas `p`, `ul` y `ol`. El texto es plano: se escapa al generar el HTML.
La fecha de publicación la fija el motor (día del despliegue); no se escribe en el borrador.

## Flujo semanal

1. Escribir el borrador con `"status": "draft"`.
2. Cuando esté aprobado, cambiar a `"status": "ready"`. Ese cambio es la autorización para publicarlo.
3. El workflow `.github/workflows/weekly-blog-publisher.yml` (lunes 14:00 UTC, o manual desde la pestaña Actions) publica **un** borrador listo por corrida:
   mueve el contenido a `content/articles/`, genera `blog/<slug>/index.html`, actualiza `content/articles.json` y `sitemap.xml`, y confirma los cambios.
4. Si hay más destacados que `featured.max` (`content/config.json`), el más antiguo pasa a `archived`: sale de la portada pero conserva su URL y su entrada en el sitemap.

## Comandos locales

```bash
node content/publish.js --check      # verifica consistencia (no escribe)
node content/publish.js --dry-run    # muestra qué se publicaría
node content/publish.js              # publica el siguiente borrador listo
```

Si la verificación o un borrador listo falla, el motor termina con error y el workflow no hace commit.
