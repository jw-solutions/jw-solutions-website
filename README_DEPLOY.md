# JW Solutions — Guía de Deploy v1.0

> **Fecha:** 2026-05-18 | **Dominio:** https://jw-solutions.com | **Email:** contact@jw-solutions.com

---

## 📁 Estructura de Archivos

```
jw-solutions-website/
├── index.html              ← Landing completa (72KB)
├── styles.css              ← Estilos completos (42KB)
├── script.js               ← JavaScript vanilla (27KB)
├── README.md               ← Esta guía
├── sitemap.xml             ← Mapa del sitio (generar)
├── robots.txt              ← Directivas robots (generar)
└── assets/
    ├── logo-jw.png         ← Logo horizontal para header (recomendado: 200x60px)
    ├── logo-jw-vertical.png ← Logo completo para footer (recomendado: 120x160px)
    ├── og-image.jpg        ← Imagen Open Graph (1200x630px, <1MB)
    └── favicon.ico         ← Favicon (32x32px o multi-resolución)
```

**Peso total estimado:** ~150KB (sin imágenes) → Lighthouse score objetivo: **90+**

---

## 🚀 Deploy en GitHub Pages (Paso a Paso)

### Paso 1: Crear repositorio en GitHub

```bash
# 1. Ve a https://github.com/new
# 2. Nombre del repositorio: jw-solutions-website
# 3. Visibilidad: Public (requerido para GitHub Pages gratuito)
# 4. NO inicializar con README (ya lo tienes)
# 5. Click "Create repository"
```

### Paso 2: Subir archivos vía Git

```bash
# En tu máquina local, crea la carpeta del proyecto
mkdir jw-solutions-website
cd jw-solutions-website

# Copia los 3 archivos generados (index.html, styles.css, script.js)
# y esta guía a esta carpeta

# Inicializa Git
git init
git remote add origin https://github.com/TU_USUARIO/jw-solutions-website.git

# Commit inicial
git add .
git commit -m "v1.0: Landing completa + CSS + JS"

# Push a main
git branch -M main
git push -u origin main
```

### Paso 3: Activar GitHub Pages

```
1. En tu repo de GitHub, ve a "Settings" (pestaña superior derecha)
2. En el menú lateral izquierdo, busca "Pages" (dentro de Code and automation)
3. En "Build and deployment":
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
4. Click "Save"
5. Espera 1-2 minutos
6. Tu sitio estará en: https://TU_USUARIO.github.io/jw-solutions-website
```

### Paso 4: Configurar dominio personalizado

```
1. En GitHub Pages Settings, sección "Custom domain"
2. Escribe: jw-solutions.com
3. Click "Save"
4. ✅ Marca "Enforce HTTPS" (GitHub genera certificado SSL gratis)
```

### Paso 5: Configurar DNS en tu proveedor de dominio

Accede al panel de tu registrador de dominios (ej: Namecheap, GoDaddy, Cloudflare) y añade estos registros:

| Tipo | Host | Valor / Points to | TTL |
|------|------|-------------------|-----|
| A | @ | 185.199.108.153 | Automático |
| A | @ | 185.199.109.153 | Automático |
| A | @ | 185.199.110.153 | Automático |
| A | @ | 185.199.111.153 | Automático |
| CNAME | www | TU_USUARIO.github.io | Automático |

```bash
# IPs de GitHub Pages (verificar en https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
# Si usas Cloudflare (recomendado), desactiva el proxy naranja (modo DNS only) durante la verificación
```

**Verificación:**
```bash
# Después de 5-30 minutos (propagación DNS), verifica:
dig jw-solutions.com +noall +answer
# Debe mostrar las 4 IPs de GitHub
```

---

## 🔧 Servicios Externos a Configurar

### 1. Formspree (Formulario de Contacto)

**¿Qué hace?** Recibe los mensajes del formulario de contacto y te los reenvía por email.

```bash
# 1. Ve a https://formspree.io/register
# 2. Crea cuenta gratuita (50 envíos/mes)
# 3. Click "New Form"
# 4. Copia el Form ID (se ve en la URL: https://formspree.io/f/XXXXXXXX)
# 5. En index.html, busca esta línea:
#    action="https://formspree.io/f/YOUR_FORM_ID"
# 6. Reemplaza YOUR_FORM_ID por tu ID real
# 7. Commit y push:
git add index.html
git commit -m "feat: activar Formspree contact form"
git push origin main
```

**Configuración adicional en Formspree Dashboard:**
- Notification email: contact@jw-solutions.com
- Auto-response: Activa respuesta automática en español/inglés
- reCAPTCHA: Habilita (protección anti-spam gratuita)
- Redirect: Configura redirección a /#contacto?success=true

---

### 2. Brevo (Newsletter / Email Marketing)

**¿Qué hace?** Gestiona suscriptores del newsletter y envía campañas.

```bash
# 1. Ve a https://www.brevo.com/ y crea cuenta gratuita
# 2. En el dashboard, ve a "Contacts" → "Lists" → "Create a list"
# 3. Nombre: "JW Solutions Newsletter"
# 4. Ve a "Campaigns" → "Settings" → "API Keys"
# 5. Genera una nueva API Key v3
# 6. Guarda la clave de forma segura (no se muestra de nuevo)

# 7. En script.js, busca la función handleNewsletterForm
# 8. Reemplaza el placeholder por la integración real de Brevo API:
```

**Código de integración Brevo (reemplazar en script.js):**

```javascript
// Reemplazar la función handleNewsletterForm completa con:

function handleNewsletterForm(e) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById('newsletter-message');
  const email = form.querySelector('[name="email"]')?.value.trim();

  if (!email || !validateEmail(email)) {
    showMessage(statusEl,
      LangSwitcher.getCurrent() === 'es' ? 'Por favor ingresa un email válido.' : 'Please enter a valid email.',
      'error');
    return;
  }

  const BREVO_API_KEY = 'TU_API_KEY_AQUI';  // ← REEMPLAZAR
  const LIST_ID = TU_LIST_ID_AQUI;            // ← REEMPLAZAR (número)

  fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      email: email,
      listIds: [LIST_ID],
      updateEnabled: true,
      attributes: {
        SOURCE: 'website_newsletter',
        LANGUAGE: LangSwitcher.getCurrent()
      }
    })
  })
  .then(response => {
    if (response.ok || response.status === 204) {
      showMessage(statusEl,
        LangSwitcher.getCurrent() === 'es' 
          ? '¡Gracias por suscribirte! Revisa tu email para confirmar.' 
          : 'Thanks for subscribing! Check your email to confirm.',
        'success');
      form.reset();

      if (typeof gtag !== 'undefined') {
        gtag('event', 'newsletter_signup', {
          event_category: 'engagement',
          event_label: 'newsletter_subscribe'
        });
      }
    } else {
      throw new Error('Brevo API error');
    }
  })
  .catch(() => {
    showMessage(statusEl,
      LangSwitcher.getCurrent() === 'es' 
        ? 'Hubo un error. Por favor intenta de nuevo más tarde.' 
        : 'There was an error. Please try again later.',
      'error');
  });
}
```

**⚠️ IMPORTANTE:** No subas la API key a GitHub público. Opciones seguras:
- Usa GitHub Secrets + GitHub Actions para inyectar la key en build time
- O usa un proxy serverless (Vercel/Netlify Function) para ocultar la key
- Para MVP inicial, la key en JS es aceptable pero rotarla periódicamente

---

### 3. Google Analytics 4

```bash
# 1. Ve a https://analytics.google.com/analytics/web/
# 2. Crea una nueva propiedad: "JW Solutions Website"
# 3. Flujo de datos: Web
# 4. URL del sitio: https://jw-solutions.com
# 5. Copia el Measurement ID (formato: G-XXXXXXXXXX)
# 6. En index.html, busca G-XXXXXXXXXX y reemplaza por tu ID real
# 7. Hay 2 lugares donde aparece (script de carga + config)

# Verificación:
# 8. Publica el sitio
# 9. Ve a GA4 → Configuración → Depuración → "Verificar en tiempo real"
# 10. Visita tu sitio y confirma que aparece en "En tiempo real"
```

---

### 4. Google Search Console (SEO)

```bash
# 1. Ve a https://search.google.com/search-console
# 2. Añade propiedad: jw-solutions.com
# 3. Método de verificación recomendado: Registro DNS TXT
#    (más estable que meta tag o archivo HTML)
# 4. Copia el registro TXT proporcionado por Google
# 5. Añádelo en tu panel DNS del dominio
# 6. Click "Verificar" en Search Console

# Una vez verificado:
# 7. Ve a "Sitemaps" en el menú lateral
# 8. Añade: sitemap.xml
# 9. Submit
```

---

## 📄 Generar Archivos SEO Restantes

### sitemap.xml

Crea archivo `sitemap.xml` en la raíz:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://jw-solutions.com/</loc>
    <lastmod>2026-05-18</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="es" href="https://jw-solutions.com/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://jw-solutions.com/?lang=en"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://jw-solutions.com/"/>
  </url>
</urlset>
```

### robots.txt

Crea archivo `robots.txt` en la raíz:

```
User-agent: *
Allow: /

Sitemap: https://jw-solutions.com/sitemap.xml

# Opcional: retraso para crawlers agresivos
# Crawl-delay: 10
```

---

## 🎨 Assets Visuales Necesarios

### Logo (URGENTE — reemplaza placeholder)

| Ubicación | Formato | Dimensiones recomendadas | Notas |
|-----------|---------|--------------------------|-------|
| Header (`.logo-mark`) | PNG/SVG | 42×42px mínimo | Isotipo "JW" con borde `#fbb200` |
| Footer | PNG/SVG | 200×60px | Logo horizontal completo |
| OG Image | JPG/PNG | 1200×630px | Diseño con marca, headline, fondo oscuro |
| Favicon | ICO/PNG | 32×32px + 180×180px (Apple touch) | Multi-resolución recomendado |

**Generación rápida de OG Image:**
```bash
# Usa Canva (gratis) con template 1200x630
# Colores: fondo #000000, acentos #fbb200
# Texto: "JW Solutions | Transforma tus datos en decisiones estratégicas"
# Exporta como JPG calidad 80% (<200KB)
```

---

## ✅ Checklist Pre-Launch

### Funcionalidad
- [ ] Language switcher funciona (ES ↔ EN)
- [ ] Mobile menu abre/cierra correctamente
- [ ] Todos los anchors navegan suavemente
- [ ] Formulario de contacto envía a Formspree (test real)
- [ ] Newsletter suscribe a Brevo (test real)
- [ ] Carousel de testimonios navega (dots, flechas, swipe)
- [ ] FAQ acordeón abre/cierra
- [ ] Back-to-top aparece al scrollear
- [ ] Partículas animan en hero (desktop)

### Responsive
- [ ] Mobile (<576px): 1 columna, menú hamburguesa
- [ ] Tablet (768px): 2 columnas servicios
- [ ] Desktop (992px+): 3 columnas, nav horizontal
- [ ] Touch: swipe carousel funciona

### Performance
- [ ] Lighthouse score >90 en móvil y desktop
- [ ] LCP <2.5s
- [ ] CLS <0.1
- [ ] Imágenes con lazy loading
- [ ] Fonts con `preconnect`

### SEO Técnico
- [ ] Meta title/description presentes
- [ ] OG tags completos
- [ ] Twitter Cards configurados
- [ ] Schema.org JSON-LD válido (testear en https://validator.schema.org/)
- [ ] Hreflang es/en/x-default
- [ ] Sitemap.xml generado y enviado a Search Console
- [ ] robots.txt presente
- [ ] Canonical URL correcta

### Analytics & Tracking
- [ ] GA4 Measurement ID reemplazado
- [ ] Eventos de CTA trackean en "En tiempo real"
- [ ] Formulario trackea submission
- [ ] Newsletter trackea signup

### Legal & Seguridad
- [ ] Política de privacidad (mínimo: página estática)
- [ ] HTTPS activo (certificado GitHub Pages)
- [ ] Email de contacto funcional (contact@jw-solutions.com)

---

## 🔄 Workflow de Actualizaciones Post-Launch

```bash
# Hacer cambios locales
# Editar index.html, styles.css, o script.js

# Commit y deploy
git add .
git commit -m "fix: descripción del cambio"
git push origin main

# GitHub Pages se actualiza automáticamente en 1-2 minutos
# Forzar refresh: Ctrl+Shift+R (Chrome) o Cmd+Shift+R (Mac)
```

---

## 🆘 Troubleshooting

| Problema | Solución |
|----------|----------|
| **Sitio no carga** | Verifica DNS con `dig jw-solutions.com`. Espera 30 minutos por propagación. |
| **CSS/JS no aplica** | Verifica rutas relativas (`styles.css`, no `/styles.css`). Forzar cache con `?v=2`. |
| **Formspree error** | Confirma Form ID correcto. Verifica en Formspree Dashboard que el form esté activo. |
| **Brevo 401 Unauthorized** | API key incorrecta o expirada. Genera nueva en Brevo Dashboard. |
| **GA4 no trackea** | Confirma Measurement ID. Verifica en "En tiempo real" de GA4. |
| **Lighthouse bajo** | Comprime imágenes (TinyPNG). Usa WebP. Minifica CSS/JS en producción. |
| **CLS alto** | Define `width`/`height` en imágenes. Evita contenido que carga tardío. |

---

## 📞 Soporte

- **Email:** contact@jw-solutions.com
- **Dominio:** https://jw-solutions.com
- **Hosting:** GitHub Pages (gratuito)
- **Estado del sitio:** https://github.com/TU_USUARIO/jw-solutions-website

---

**JW Solutions © 2026 — Transforma tus datos en decisiones estratégicas.**
