#!/usr/bin/env python3
"""Genera dist-public/ con solo los recursos de tier "free" del Code Formatter.

Uso:
    python scripts/code-formatter/build_public.py            # construye dist-public/
    python scripts/code-formatter/build_public.py --dev      # solo escribe el features.runtime.json de desarrollo (todo activo)
    python scripts/code-formatter/build_public.py --sitemap  # solo regenera sitemap-code-formatter.xml (raíz del repo)
    python scripts/code-formatter/build_public.py --fix      # solo regenera tools/code-formatter/fix/ (landings de errores)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import date, datetime, timezone
from email.utils import format_datetime
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "config" / "features-matrix.json"
RUNTIME_REL = Path("tools/code-formatter/features.runtime.json")
DIST = ROOT / "dist-public"
SITE = "https://jw-solutions.com"
SITEMAP_NAME = "sitemap-code-formatter.xml"
TIPS_MANIFEST = ROOT / "content" / "code-formatter-tips" / "code-formatter-manifest.json"
SITEMAP_LANGS = ["es", "en", "pt-BR", "pt-PT", "fr", "de", "it"]  # es = URL base sin ?lang=
TOOL_PATH = "/tools/code-formatter/"
TIP_CATEGORY_PATH = {
    "python": "tips/python/",
    "javascript": "tips/javascript/",
    "typescript": "tips/javascript/",
    "java": "tips/java/",
    "csharp": "tips/csharp/",
    "php": "tips/php/",
    "sql": "tips/sql-dax/",
    "dax": "tips/sql-dax/",
    "json": "tips/json-yaml/",
    "yaml": "tips/json-yaml/",
}
OG_LOCALE = {
    "es": "es_ES",
    "en": "en_US",
    "pt-BR": "pt_BR",
    "pt-PT": "pt_PT",
    "fr": "fr_FR",
    "de": "de_DE",
    "it": "it_IT",
}
TIP_UI_STRINGS = {
    "es": {"try": "Probar fragmento en el formateador", "fix": "Ver guía de solución de errores", "related": "Tips relacionados", "related_guides": "Guías y Tips relacionados", "faq": "Preguntas frecuentes", "back": "Todos los tips", "home": "Volver al formateador"},
    "en": {"try": "Try snippet in the formatter", "fix": "View syntax error fix guide", "related": "Related tips", "related_guides": "Related Guides & Tips", "faq": "Frequently Asked Questions", "back": "All tips", "home": "Back to formatter"},
    "pt-BR": {"try": "Testar trecho no formatador", "fix": "Ver guia de correção de erros", "related": "Dicas relacionadas", "related_guides": "Guias e Dicas relacionados", "faq": "Perguntas frequentes", "back": "Todas as dicas", "home": "Voltar ao formatador"},
    "pt-PT": {"try": "Experimentar excerto no formatador", "fix": "Ver guia de correção de erros", "related": "Dicas relacionadas", "related_guides": "Guias e Dicas relacionados", "faq": "Perguntas frequentes", "back": "Todas as dicas", "home": "Voltar ao formatador"},
    "fr": {"try": "Tester l'extrait dans le formateur", "fix": "Voir le guide de correction", "related": "Astuces associées", "related_guides": "Guides et Astuces associés", "faq": "Foire aux questions", "back": "Toutes les astuces", "home": "Retour au formateur"},
    "de": {"try": "Snippet im Formatter testen", "fix": "Fehlerbehebungs-Guide ansehen", "related": "Verwandte Tipps", "related_guides": "Verwandte Guides & Tipps", "faq": "Häufig gestellte Fragen", "back": "Alle Tipps", "home": "Zurück zum Formatter"},
    "it": {"try": "Prova lo snippet nel formattatore", "fix": "Vedi guida alla correzione", "related": "Suggerimenti correlati", "related_guides": "Guide e Suggerimenti correlati", "faq": "Domande frequenti", "back": "Tutti i suggerimenti", "home": "Torna al formattatore"},
}
SQUAD_LABELS = {
    "es": "Únete a nuestro Squad en daily.dev",
    "en": "Join our daily.dev Squad",
    "pt-BR": "Participe do nosso Squad no daily.dev",
    "pt-PT": "Participe do nosso Squad no daily.dev",
    "fr": "Rejoignez notre Squad sur daily.dev",
    "de": "Tritt unserem daily.dev Squad bei",
    "it": "Unisciti al nostro Squad su daily.dev",
}
SHARE_UI_STRINGS = {
    "es": {
        "title": "Compartir artículo",
        "native": "Compartir",
        "linkedin": "Compartir en LinkedIn",
        "x": "Compartir en X",
        "whatsapp": "Compartir en WhatsApp",
        "copy": "Copiar enlace",
        "copied": "¡Enlace copiado!",
        "copy_fail": "No se pudo copiar el enlace.",
    },
    "en": {
        "title": "Share article",
        "native": "Share",
        "linkedin": "Share on LinkedIn",
        "x": "Share on X",
        "whatsapp": "Share on WhatsApp",
        "copy": "Copy link",
        "copied": "Link copied!",
        "copy_fail": "Could not copy link.",
    },
    "pt-BR": {
        "title": "Compartilhar artigo",
        "native": "Compartilhar",
        "linkedin": "Compartilhar no LinkedIn",
        "x": "Compartilhar no X",
        "whatsapp": "Compartilhar no WhatsApp",
        "copy": "Copiar link",
        "copied": "Link copiado!",
        "copy_fail": "Não foi possível copiar o link.",
    },
    "pt-PT": {
        "title": "Partilhar artigo",
        "native": "Partilhar",
        "linkedin": "Partilhar no LinkedIn",
        "x": "Partilhar no X",
        "whatsapp": "Partilhar no WhatsApp",
        "copy": "Copiar ligação",
        "copied": "Ligação copiada!",
        "copy_fail": "Não foi possível copiar a ligação.",
    },
    "fr": {
        "title": "Partager l'article",
        "native": "Partager",
        "linkedin": "Partager sur LinkedIn",
        "x": "Partager sur X",
        "whatsapp": "Partager sur WhatsApp",
        "copy": "Copier le lien",
        "copied": "Lien copié !",
        "copy_fail": "Impossible de copier le lien.",
    },
    "de": {
        "title": "Artikel teilen",
        "native": "Teilen",
        "linkedin": "Auf LinkedIn teilen",
        "x": "Auf X teilen",
        "whatsapp": "Auf WhatsApp teilen",
        "copy": "Link kopieren",
        "copied": "Link kopiert!",
        "copy_fail": "Link konnte nicht kopiert werden.",
    },
    "it": {
        "title": "Condividi articolo",
        "native": "Condividi",
        "linkedin": "Condividi su LinkedIn",
        "x": "Condividi su X",
        "whatsapp": "Condividi su WhatsApp",
        "copy": "Copia link",
        "copied": "Link copiato!",
        "copy_fail": "Impossibile copiare il link.",
    },
}


def _share_bar_html(canonical_url: str, title: str, loc: str) -> str:
    """Genera bloque HTML accesible de compartir social con URL canónica validada."""
    if not str(canonical_url).startswith(f"{SITE}/"):
        return ""
    s = SHARE_UI_STRINGS.get(loc, SHARE_UI_STRINGS["en"])
    u = quote(canonical_url, safe="")
    t_enc = quote(str(title or "")[:200], safe="")
    li_href = f"https://www.linkedin.com/sharing/share-offsite/?url={u}"
    x_href = f"https://twitter.com/intent/tweet?text={t_enc}&amp;url={u}"
    wa_href = f"https://api.whatsapp.com/send?text={t_enc}%20{u}"
    return (
        f'      <section class="cf-card cf-share" data-cf-share="1" data-share-url="{escape(canonical_url, quote=True)}" '
        f'data-share-title="{escape(str(title or "")[:200], quote=True)}" aria-label="{escape(s["title"], quote=True)}">\n'
        f'        <h2 class="cf-share__title">{escape(s["title"])}</h2>\n'
        '        <div class="cf-share__actions">\n'
        f'          <button type="button" class="cf-share__btn cf-share__btn--primary" data-cf-share-native hidden>{escape(s["native"])}</button>\n'
        f'          <a class="cf-share__btn" data-cf-share-net="linkedin" href="{li_href}" target="_blank" rel="noopener noreferrer" aria-label="{escape(s["linkedin"], quote=True)}">LinkedIn</a>\n'
        f'          <a class="cf-share__btn" data-cf-share-net="x" href="{x_href}" target="_blank" rel="noopener noreferrer" aria-label="{escape(s["x"], quote=True)}">X</a>\n'
        f'          <a class="cf-share__btn" data-cf-share-net="whatsapp" href="{wa_href}" target="_blank" rel="noopener noreferrer" aria-label="{escape(s["whatsapp"], quote=True)}">WhatsApp</a>\n'
        f'          <button type="button" class="cf-share__btn" data-cf-share-copy="1" data-copied-msg="{escape(s["copied"], quote=True)}" data-copy-fail-msg="{escape(s["copy_fail"], quote=True)}">{escape(s["copy"])}</button>\n'
        '        </div>\n'
        '        <p class="cf-share__status" role="status" aria-live="polite"></p>\n'
        '      </section>'
    )
ACADEMY_CTA_COPY = {
    "es": {
        "tag": "Academia Guiada",
        "title": "Domina este concepto paso a paso en Modo Academia",
        "body": "Practica por niveles con validación en vivo y ejercicios guiados. Comienza gratis y explora las modalidades Pro de la plataforma.",
        "primary": "Practicar en Modo Academia",
        "secondary": "Ver modalidades",
    },
    "en": {
        "tag": "Guided Academy",
        "title": "Master this concept step by step in Academy Mode",
        "body": "Practice by levels with live validation and guided drills. Start free and explore Pro training tracks on the platform.",
        "primary": "Practice in Academy Mode",
        "secondary": "Explore plans",
    },
    "pt-BR": {
        "tag": "Academia Guiada",
        "title": "Domine este conceito passo a passo no Modo Academia",
        "body": "Pratique por níveis com validação ao vivo e exercícios guiados. Comece grátis e conheça as modalidades Pro.",
        "primary": "Praticar no Modo Academia",
        "secondary": "Ver modalidades",
    },
    "pt-PT": {
        "tag": "Academia Guiada",
        "title": "Domine este conceito passo a passo no Modo Academia",
        "body": "Pratique por níveis com validação em direto e exercícios guiados. Comece grátis e explore as modalidades Pro.",
        "primary": "Praticar no Modo Academia",
        "secondary": "Ver modalidades",
    },
    "fr": {
        "tag": "Académie Guidée",
        "title": "Maîtrisez ce concept étape par étape en Mode Académie",
        "body": "Entraînez-vous par niveaux avec validation en direct. Commencez gratuitement et découvrez les parcours Pro.",
        "primary": "Pratiquer en Mode Académie",
        "secondary": "Voir les formules",
    },
    "de": {
        "tag": "Geführte Akademie",
        "title": "Meistere dieses Konzept Schritt für Schritt im Akademie-Modus",
        "body": "Übe in Levels mit Live-Validierung und geführten Drills. Starte kostenlos und entdecke die Pro-Pfade.",
        "primary": "Im Akademie-Modus üben",
        "secondary": "Optionen ansehen",
    },
    "it": {
        "tag": "Accademia Guidata",
        "title": "Padroneggia questo concetto passo dopo passo in Modalità Accademia",
        "body": "Esercitati per livelli con validazione dal vivo. Inizia gratis e scopri i percorsi Pro della piattaforma.",
        "primary": "Pratica in Modalità Accademia",
        "secondary": "Vedi modalità",
    },
}


def _academy_cta_block(tool_rel: str, loc: str, topic: str, slug: str, level: int = 1, source: str = "tips_article") -> str:
    c = ACADEMY_CTA_COPY.get(loc, ACADEMY_CTA_COPY["es"])
    safe_topic = quote(str(topic or "python").lower())
    safe_slug = quote(str(slug or "academy"))
    safe_loc = quote(str(loc or "es"))
    primary_href = (
        f"{tool_rel}?mode=learn&amp;lang={safe_loc}&amp;topic={safe_topic}"
        f"&amp;level={int(level)}&amp;utm_source={escape(source)}&amp;utm_medium=bottom_cta&amp;utm_campaign={safe_slug}"
    )
    secondary_href = f"{tool_rel}?mode=learn&amp;lang={safe_loc}&amp;topic={safe_topic}&amp;open_plans=1"
    return (
        '      <aside class="cf-card cf-academy-funnel-cta" aria-label="Academy">\n'
        f'        <span class="cf-tag">{escape(c["tag"])}</span>\n'
        f'        <h2 class="cf-tip__h">{escape(c["title"])}</h2>\n'
        f'        <p class="cf-muted">{escape(c["body"])}</p>\n'
        '        <div class="cf-tip-modal__actions">\n'
        f'          <a class="cf-btn cf-btn--primary" href="{primary_href}">{escape(c["primary"])}</a>\n'
        f'          <a class="cf-btn cf-btn--secondary" href="{secondary_href}">{escape(c["secondary"])}</a>\n'
        '        </div>\n'
        '      </aside>'
    )
FIX_SRC = ROOT / "content" / "code-formatter-tips" / "syntax-fixes.json"
FIX_REL = "tools/code-formatter/fix"
OG_DEFAULT = f"{SITE}/assets/images/og/code-formatter-default.png"
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class CommercialStripper(HTMLParser):
    """Elimina del HTML los elementos con data-cf-commercial, conservando el resto tal cual."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.out: list[str] = []
        self.depth = 0

    def _emit(self, raw: str) -> None:
        if not self.depth:
            self.out.append(raw)

    def handle_starttag(self, tag, attrs):
        raw = self.get_starttag_text()
        if self.depth:
            if tag not in VOID_TAGS:
                self.depth += 1
        elif any(name == "data-cf-commercial" for name, _ in attrs):
            if tag not in VOID_TAGS:
                self.depth = 1
        else:
            self.out.append(raw)

    def handle_startendtag(self, tag, attrs):
        if not self.depth and not any(name == "data-cf-commercial" for name, _ in attrs):
            self.out.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1
        else:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        self._emit(data)

    def handle_entityref(self, name):
        self._emit(f"&{name};")

    def handle_charref(self, name):
        self._emit(f"&#{name};")

    def handle_comment(self, data):
        self._emit(f"<!--{data}-->")

    def handle_decl(self, decl):
        self._emit(f"<!{decl}>")


def _es(key: str) -> str:
    """Cadena de la interfaz en español (locales/es.js): evita duplicar textos en este script."""
    src = (ROOT / "assets/js/tools/code-formatter/locales/es.js").read_text(encoding="utf-8")
    m = re.search(rf'\b{key}: ("(?:[^"\\]|\\.)*")', src)
    return json.loads(m.group(1)) if m else key


def load_fixes() -> dict:
    return json.loads(FIX_SRC.read_text(encoding="utf-8")) if FIX_SRC.is_file() else {"errors": [], "published_at": date.today().isoformat()}


def _alternates(path: str) -> str:
    rows = [f'  <link rel="alternate" hreflang="{l}" href="{SITE}{path}{"" if l == "es" else f"?lang={l}"}">' for l in SITEMAP_LANGS]
    rows.append(f'  <link rel="alternate" hreflang="x-default" href="{SITE}{path}">')
    return "\n".join(rows)


FIX_PAGE = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@@TITLE@@ | Code Formatter &amp; Auto-Doc AI</title>
  <meta name="description" content="@@DESC@@">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.jw-solutions.com https://formspree.io; object-src 'none'; base-uri 'self'; form-action 'self' https://formspree.io">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="@@URL@@">
@@ALTERNATES@@
  <link rel="alternate" type="application/rss+xml" title="Code Formatter &amp; Auto-Doc AI Tips" href="https://jw-solutions.com/tools/code-formatter/tips/feed.@@RSS_LANG@@.xml">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="JW Solutions">
  <meta property="og:title" content="@@TITLE@@ | Code Formatter &amp; Auto-Doc AI">
  <meta property="og:description" content="@@DESC@@">
  <meta property="og:url" content="@@URL@@">
  <meta property="og:locale" content="es_ES">
  <meta property="og:image" content="@@OG@@">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="@@TITLE@@ | Code Formatter &amp; Auto-Doc AI">
  <meta name="twitter:description" content="@@DESC@@">
  <meta name="twitter:image" content="@@OG@@">
  <meta name="theme-color" content="#0b0f17">
  <meta name="cf-newsletter-endpoint" content="https://api.jw-solutions.com/api/newsletter/subscribe">
  <link rel="icon" type="image/svg+xml" href="@@TOOL@@favicon.svg">
  <link rel="icon" type="image/x-icon" sizes="any" href="@@TOOL@@favicon.ico">
  <link rel="apple-touch-icon" href="@@TOOL@@apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Roboto:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="@@REPO@@assets/css/tools/code-formatter.css">
@@JSONLD@@
</head>
<body class="cf-body">
  <a class="cf-skip" href="#cf-main" data-i18n="skip">Saltar al contenido</a>

  <header class="cf-header">
    <div class="cf-container cf-header__inner">
      <div class="cf-logo" role="img" aria-label="JW Solutions">
        <span class="cf-logo__mark">JW</span>
        <span class="cf-logo__text">SOLUTIONS</span>
      </div>
      <nav class="cf-nav" aria-label="Code Formatter">
        <select id="cf-ui-lang" class="cf-select cf-select--compact" data-i18n-aria="uiLang" aria-label="Idioma de la interfaz"></select>
        <a class="cf-nav__link" data-site-link data-i18n="tipsBackTool" href="@@TOOL@@">Volver al formateador</a>
      </nav>
    </div>
  </header>

  <main id="cf-main" class="cf-main" data-fix-data="@@DATA@@"@@MAINATTRS@@>
    <section class="cf-container cf-hero">
      <span class="cf-tag" data-i18n="fixTag">@@TAG@@</span>
      <h1 id="cf-fix-title" class="cf-title">@@H1@@</h1>
      <p id="cf-fix-lead" class="cf-lead cf-fix__lead">@@LEAD@@</p>
    </section>
    <section class="cf-container cf-tips">
      <div id="cf-fix-body" class="cf-card cf-tip">
@@BODY@@
      </div>
    </section>
  </main>

  <footer class="cf-footer">
    <div class="cf-container cf-footer__grid">
      <section class="cf-footer__col" aria-labelledby="cf-foot-id">
        <div class="cf-logo" role="img" aria-label="JW Solutions">
          <span class="cf-logo__mark">JW</span>
          <span class="cf-logo__text">SOLUTIONS</span>
        </div>
        <h2 id="cf-foot-id" class="cf-footer__title">Code Formatter <span class="cf-gold">&amp; Auto-Doc AI</span></h2>
        <p class="cf-footer__text" data-i18n="footDesc">Formatea y documenta tu código en Python, JavaScript, SQL, DAX y más. Herramienta independiente de JW Solutions.</p>
        <ul class="cf-footer__list">
          <li><a href="@@TOOL@@" data-site-link data-i18n="footEditor">Ir al editor</a></li>
          <li><a href="https://dly.to/nmdN9vQObOU" target="_blank" rel="noopener noreferrer" data-i18n="footDailyDevSquad">@@SQUAD_LABEL@@</a></li>
        </ul>
      </section>

      <nav class="cf-footer__col" aria-labelledby="cf-foot-tips">
        <h2 id="cf-foot-tips" class="cf-footer__title" data-i18n="footTipsTitle">Tips semanales</h2>
        <ul class="cf-footer__list">
          <li><a href="@@TOOL@@tips/python/" data-site-link data-i18n="tipPython">Python Tips</a></li>
          <li><a href="@@TOOL@@tips/javascript/" data-site-link data-i18n="tipJs">JavaScript Standards</a></li>
          <li><a href="@@TOOL@@tips/sql-dax/" data-site-link data-i18n="tipSqlDax">SQL &amp; DAX Best Practices</a></li>
        </ul>
        <h2 id="cf-foot-fix" class="cf-footer__title cf-footer__title--sub" data-i18n="footFixTitle">Soluciones a errores</h2>
        <ul class="cf-footer__list">
          <li><a href="@@TOOL@@fix/" data-site-link data-i18n="fixHubTitle">Soluciones rápidas a errores de sintaxis</a></li>
        </ul>
      </nav>

      <section class="cf-footer__col" aria-labelledby="cf-foot-nl">
        <h2 id="cf-foot-nl" class="cf-footer__title" data-i18n="nlTitle">Tips Semanales de Código</h2>
        <p class="cf-footer__text" data-i18n="nlPromise">Un email por semana con tips prácticos de sintaxis, casos de estudio y novedades de lenguajes (Python, JS, SQL, DAX). Sin spam, sin ruido. Puedes darte de baja en cualquier momento.</p>
        <form id="cf-newsletter-form" class="cf-newsletter" novalidate>
          <label class="cf-sr-only" for="cf-newsletter-email" data-i18n="nlEmailLabel">Correo electrónico</label>
          <input id="cf-newsletter-email" class="cf-input" type="email" name="email" required maxlength="254" autocomplete="email" placeholder="tu@email.com" data-i18n-placeholder="nlPlaceholder">
          <input type="text" name="_gotcha" class="cf-sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button type="submit" class="cf-btn cf-btn--primary" data-i18n="nlSubmit">Suscribirme</button>
          <p id="cf-newsletter-status" class="cf-form__status cf-newsletter__status" role="status" aria-live="polite"></p>
        </form>
      </section>
    </div>
    <div class="cf-container cf-footer__legal">
      <p>&copy; JW Solutions · <span data-i18n="footRights">Todos los derechos reservados</span> · <a href="/privacidad/" data-site-link data-i18n="legalPrivacy">Política de Privacidad</a> · <a href="/terminos/" data-site-link data-i18n="legalTerms">Términos de Servicio</a></p>
    </div>
  </footer>

  <div id="cf-toast" class="cf-toast" role="status" aria-live="polite"></div>
  <script type="module" src="@@REPO@@assets/js/tools/code-formatter/fix-page.js"></script>
</body>
</html>
"""


def _fill(template: str, **kv: str) -> str:
    for k, v in kv.items():
        template = template.replace(f"@@{k}@@", v)
    return template


def _load_published_tips() -> list[dict]:
    if not TIPS_MANIFEST.is_file():
        return []
    tips = json.loads(TIPS_MANIFEST.read_text(encoding="utf-8")).get("tips", [])
    return sorted(tips, key=lambda t: (t.get("published_at") or t.get("date") or "", t["slug"]), reverse=True)


def _related_tips_block(prog_lang: str, loc: str, tips: list[dict]) -> str:
    """Devuelve los últimos 3 tips del mismo lenguaje (con fallback a los últimos 3 generales)."""
    if not tips:
        return ""
    matched = [t for t in tips if (t.get("programming_language") or t.get("language")) == prog_lang][:3]
    if len(matched) < 3:
        matched.extend([t for t in tips if t not in matched][: 3 - len(matched)])
    ui = TIP_UI_STRINGS.get(loc, TIP_UI_STRINGS["en"])
    items = []
    for t in matched:
        t_lang = t.get("programming_language") or t.get("language") or "python"
        cat_path = TIP_CATEGORY_PATH.get(t_lang, "tips/python/")
        t_loc = t if loc == "es" else (t.get("translations", {}).get(loc) or t)
        target_loc = loc if (loc == "es" or loc in t.get("translations", {})) else "es"
        href = f"{SITE}{TOOL_PATH}{cat_path}{t['slug']}/{target_loc}/"
        items.append(f'<li class="cf-card"><a href="{escape(href, quote=True)}">{escape(t_loc["title"])}</a></li>')
    return f'        <h2 class="cf-tip__h">{escape(ui["related_guides"])}</h2>\n        <ul class="cf-fix__list">{"".join(items)}</ul>'


def fix_pages() -> dict[str, str]:
    """{ruta relativa al repo: contenido}. Hub + landings por error en 7 idiomas + fix-data.json."""
    cfg = load_fixes()
    errors = cfg["errors"]
    pub = cfg.get("published_at", date.today().isoformat())
    tips = _load_published_tips()
    out: dict[str, str] = {}
    data = {"published_at": pub, "errors": {e["slug"]: {k: e[k] for k in ("language", "error", "version", "before", "after", "i18n")} for e in errors}}
    out[f"{FIX_REL}/fix-data.json"] = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    tag = _es("fixTag")

    for e in errors:
        path = f"{TOOL_PATH}fix/{e['slug']}/"
        for lang_code in SITEMAP_LANGS:
            loc = e["i18n"].get(lang_code) or e["i18n"]["es"]
            is_root = lang_code == "es"
            url = SITE + (path if is_root else f"{path}{lang_code}/")
            steps = loc["steps"]
            ld = {
                "@context": "https://schema.org",
                "@graph": [
                    {"@type": "TechArticle", "headline": loc["title"], "description": loc["summary"], "inLanguage": lang_code, "url": url,
                     "mainEntityOfPage": {"@type": "WebPage", "@id": url}, "image": OG_DEFAULT, "about": {"@type": "Thing", "name": e["error"]},
                     "datePublished": pub, "dateModified": pub, "author": {"@type": "Organization", "name": "JW Solutions"},
                     "publisher": {"@type": "Organization", "name": "JW Solutions", "url": SITE}},
                    {"@type": "HowTo", "name": loc["title"], "description": loc["summary"], "inLanguage": lang_code, "url": url,
                     "step": [{"@type": "HowToStep", "position": i + 1, "name": t, "text": t} for i, t in enumerate(steps)]},
                ],
            }
            others_prefix = "../" if is_root else "../../"
            tool_rel = "../../" if is_root else "../../../"
            repo_rel = "../../../../" if is_root else "../../../../../"
            data_rel = "../fix-data.json" if is_root else "../../fix-data.json"
            others = "".join(
                f'<li class="cf-card"><a href="{others_prefix}{o["slug"]}/{"" if is_root else f"?lang={lang_code}"}">{escape((o["i18n"].get(lang_code) or o["i18n"]["es"])["title"])}</a></li>'
                for o in errors if o["slug"] != e["slug"]
            )
            related_tips = _related_tips_block(e["language"], lang_code, tips)
            share_bar = _share_bar_html(url, loc["title"], lang_code)
            academy_cta = _academy_cta_block(tool_rel, lang_code, e["language"], e["slug"], level=1, source="fix_landing")
            body = (
                f'        <div class="cf-fix__pair"><div><p class="cf-fix__label cf-fix__label--bad">{escape(_es("fixBefore"))}</p><pre class="cf-tip__code"><code>{escape(e["before"])}</code></pre></div>'
                f'<div><p class="cf-fix__label cf-fix__label--good">{escape(_es("fixAfter"))}</p><pre class="cf-tip__code"><code>{escape(e["after"])}</code></pre></div></div>\n'
                f'        <h2 class="cf-tip__h">{escape(_es("fixSteps"))}</h2>\n        <ol class="cf-fix__steps">{"".join(f"<li>{escape(t)}</li>" for t in steps)}</ol>\n'
                f'        <p><a class="cf-btn cf-btn--primary cf-fix__cta" href="{tool_rel}?sample=1&amp;lang={escape(lang_code)}">{escape(_es("fixCta"))}</a></p>\n'
                f'{share_bar}\n'
                f'{related_tips}\n'
                f'        <h2 class="cf-tip__h">{escape(_es("fixOthers"))}</h2>\n        <ul class="cf-fix__list">{others}</ul>\n'
                f'{academy_cta}'
            )
            page_html = _fill(
                FIX_PAGE, TITLE=escape(loc["title"]), DESC=escape(loc["summary"]), URL=url, ALTERNATES=_alternates(path),
                RSS_LANG=escape(lang_code), SQUAD_LABEL=escape(SQUAD_LABELS.get(lang_code, SQUAD_LABELS["es"])), OG=OG_DEFAULT, TOOL=tool_rel, REPO=repo_rel,
                DATA=data_rel, MAINATTRS=f' data-fix-slug="{e["slug"]}" data-fix-root="{tool_rel}"', TAG=escape(tag), H1=escape(loc["title"]), LEAD=escape(loc["summary"]), BODY=body,
                JSONLD='  <script type="application/ld+json" id="cf-jsonld">' + json.dumps(ld, ensure_ascii=False) + "</script>",
            )
            if not is_root:
                page_html = page_html.replace('<html lang="es">', f'<html lang="{escape(lang_code)}">', 1)
                page_html = page_html.replace('content="es_ES"', f'content="{OG_LOCALE.get(lang_code, "en_US")}"', 1)
            out[f"{FIX_REL}/{e['slug']}/{lang_code}/index.html"] = page_html
            if is_root:
                out[f"{FIX_REL}/{e['slug']}/index.html"] = page_html

    hub_path = f"{TOOL_PATH}fix/"
    cards = "".join(
        f'<li class="cf-card"><a href="{e["slug"]}/"><span class="cf-fix__chip">{escape(e["language"])}</span><br>{escape(e["i18n"]["es"]["title"])}</a></li>' for e in errors
    )
    out[f"{FIX_REL}/index.html"] = _fill(
        FIX_PAGE, TITLE=escape(_es("fixHubTitle")), DESC=escape(_es("fixHubLead")), URL=SITE + hub_path, ALTERNATES=_alternates(hub_path),
        RSS_LANG="es", SQUAD_LABEL=escape(SQUAD_LABELS["es"]), OG=OG_DEFAULT, TOOL="../", REPO="../../../",
        DATA="fix-data.json", MAINATTRS="", TAG=escape(tag), H1=escape(_es("fixHubTitle")), LEAD=escape(_es("fixHubLead")), BODY=f'        <ul class="cf-fix__list">{cards}</ul>', JSONLD="",
    )
    return out


def write_fix_pages(*roots: Path) -> list[str]:
    pages = fix_pages()
    for root in roots:
        for rel, content in pages.items():
            dst = root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(content, encoding="utf-8", newline="\n")
    return sorted(pages)


def _strip_frontmatter(raw: str) -> tuple[dict[str, object], str]:
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", raw)
    if not m:
        return {}, raw
    meta: dict[str, object] = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not kv:
            continue
        k, v = kv.group(1), kv.group(2).strip()
        if (v.startswith("[") and v.endswith("]")) or (v.startswith("{") and v.endswith("}")):
            try:
                meta[k] = json.loads(v)
                continue
            except Exception:
                pass
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            try:
                v = json.loads(v) if v.startswith('"') else v[1:-1]
            except Exception:
                v = v[1:-1]
        meta[k] = v
    return meta, raw[m.end():]


def _md_inline(text: str) -> str:
    parts = re.split(r"(`[^`]+`|\*\*[^*]+\*\*)", text)
    out: list[str] = []
    for p in parts:
        if not p:
            continue
        if p.startswith("`") and p.endswith("`") and len(p) >= 2:
            out.append(f"<code>{escape(p[1:-1])}</code>")
        elif p.startswith("**") and p.endswith("**") and len(p) >= 4:
            out.append(f"<strong>{escape(p[2:-2])}</strong>")
        else:
            out.append(escape(p))
    return "".join(out)


def _md_to_html(md_body: str) -> tuple[str, str, str]:
    """Convierte Markdown a HTML seguro y extrae (html, primer_párrafo, primer_bloque_código)."""
    lines = md_body.splitlines()
    out: list[str] = []
    para: list[str] = []
    in_list = False
    first_para = ""
    first_code = ""

    def flush_para() -> None:
        nonlocal first_para
        if para:
            joined = " ".join(para)
            if not first_para:
                first_para = re.sub(r"[`*]", "", joined)[:160]
            out.append(f"        <p>{_md_inline(joined)}</p>")
            para.clear()

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            out.append("        </ul>")
            in_list = False

    i = 0
    while i < len(lines):
        line = lines[i]
        fence = re.match(r"^```(\w*)", line)
        if fence:
            flush_para()
            close_list()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            code_txt = "\n".join(code_lines)
            if not first_code and code_txt.strip():
                first_code = code_txt
            out.append(f'        <pre class="cf-tip__code"><code>{escape(code_txt)}</code></pre>')
            i += 1
            continue
        h = re.match(r"^(#{1,3})\s+(.*)$", line)
        if h:
            flush_para()
            close_list()
            tag = "h2" if len(h.group(1)) <= 2 else "h3"
            out.append(f'        <{tag} class="cf-tip__h">{_md_inline(h.group(2))}</{tag}>')
            i += 1
            continue
        li = re.match(r"^\s*[-*]\s+(.*)$", line)
        if li:
            flush_para()
            if not in_list:
                out.append('        <ul class="cf-tip__list">')
                in_list = True
            out.append(f"          <li>{_md_inline(li.group(1))}</li>")
            i += 1
            continue
        if not line.strip():
            flush_para()
            close_list()
            i += 1
            continue
        close_list()
        para.append(line.strip())
        i += 1

    flush_para()
    close_list()
    return "\n".join(out), first_para, first_code


def _tip_alternates(cat_path: str, slug: str, avail_langs: list[str]) -> str:
    rows = [
        f'  <link rel="alternate" hreflang="{l}" href="{SITE}{TOOL_PATH}{cat_path}{slug}/{l}/">'
        for l in avail_langs
    ]
    rows.append(f'  <link rel="alternate" hreflang="x-default" href="{SITE}{TOOL_PATH}{cat_path}{slug}/es/">')
    return "\n".join(rows)


def tip_pages() -> dict[str, str]:
    """Genera páginas HTML estáticas localizadas por idioma para cada tip publicado."""
    if not TIPS_MANIFEST.is_file():
        return {}
    tips = json.loads(TIPS_MANIFEST.read_text(encoding="utf-8")).get("tips", [])
    fixes = load_fixes().get("errors", []) if FIX_SRC.is_file() else []
    fix_by_slug = {f["slug"]: f for f in fixes}
    fix_by_lang = {f["language"]: f for f in fixes}
    tips_dir = ROOT / "content" / "code-formatter-tips"
    out: dict[str, str] = {}

    for tip in tips:
        slug = tip["slug"]
        prog_lang = tip.get("programming_language") or tip.get("language") or "python"
        cat_path = TIP_CATEGORY_PATH.get(prog_lang, "tips/python/")
        avail_langs = [l for l in SITEMAP_LANGS if l == "es" or l in tip.get("translations", {})]
        alternates = _tip_alternates(cat_path, slug, avail_langs)
        pub_date = tip.get("published_at") or tip.get("date") or date.today().isoformat()

        for loc in avail_langs:
            tr = tip if loc == "es" else tip["translations"][loc]
            md_path = tips_dir / tr["file"]
            if not md_path.is_file():
                continue
            fm, md_body = _strip_frontmatter(md_path.read_text(encoding="utf-8"))
            body_html, first_para, first_code = _md_to_html(md_body)
            title = tr.get("title") or tip["title"]
            category = tr.get("category") or tip.get("category") or "Code Formatter"
            desc = (
                tr.get("meta_description")
                or fm.get("meta_description")
                or tr.get("summary")
                or fm.get("summary")
                or first_para
                or title
            )[:160]
            snippet = tip.get("interactive_snippet") or fm.get("interactive_snippet") or first_code
            ui = TIP_UI_STRINGS.get(loc, TIP_UI_STRINGS["en"])
            url = f"{SITE}{TOOL_PATH}{cat_path}{slug}/{loc}/"
            og_img = f"{SITE}/assets/images/og/tips/{slug}-{loc}.png"

            # Enlazado cruzado: editor, guía /fix/ y 3 tips relacionados
            cta_href = f"{SITE}{TOOL_PATH}?lang={quote(loc)}"
            if snippet:
                cta_href += f"&snippet={quote(snippet[:1800])}"
            fix_slug = tip.get("related_fix_slug") or fm.get("related_fix_slug")
            fix_obj = fix_by_slug.get(fix_slug) if fix_slug else fix_by_lang.get(prog_lang)
            fix_block = ""
            if fix_obj:
                fix_loc = fix_obj["i18n"].get(loc) or fix_obj["i18n"]["es"]
                fix_url = f"{SITE}{TOOL_PATH}fix/{fix_obj['slug']}/?lang={quote(loc)}"
                fix_block = f'        <p><a class="cf-nav__link" href="{escape(fix_url, quote=True)}">{escape(ui["fix"])}: {escape(fix_loc["title"])}</a></p>\n'

            related = [o for o in tips if o["slug"] != slug and (o["language"] == prog_lang or o.get("programming_language") == prog_lang)][:3]
            if len(related) < 3:
                related.extend([o for o in tips if o["slug"] != slug and o not in related][: 3 - len(related)])
            rel_items = []
            for o in related:
                o_loc = o if loc == "es" else o.get("translations", {}).get(loc) or o
                o_cat = TIP_CATEGORY_PATH.get(o.get("programming_language") or o["language"], "tips/python/")
                o_url = f"{SITE}{TOOL_PATH}{o_cat}{o['slug']}/{loc if (loc == 'es' or loc in o.get('translations', {})) else 'es'}/"
                rel_items.append(f'<li class="cf-card"><a href="{escape(o_url, quote=True)}">{escape(o_loc["title"])}</a></li>')
            rel_block = (
                f'        <h2 class="cf-tip__h">{escape(ui["related"])}</h2>\n        <ul class="cf-fix__list">{"".join(rel_items)}</ul>'
                if rel_items
                else ""
            )

            faq_items = tr.get("faq") or fm.get("faq")
            valid_faq = (
                [x for x in faq_items if isinstance(x, dict) and str(x.get("q", "")).strip() and str(x.get("a", "")).strip()]
                if isinstance(faq_items, list)
                else []
            )
            faq_section = ""
            if valid_faq:
                details_html = "".join(
                    f'          <details class="cf-faq__item"><summary>{escape(str(item["q"]))}</summary>'
                    f'<p>{escape(str(item["a"]))}</p></details>\n'
                    for item in valid_faq
                )
                faq_section = (
                    f'        <section class="cf-tip-faq" aria-labelledby="cf-faq-title">\n'
                    f'          <h2 id="cf-faq-title" class="cf-tip__h">{escape(ui["faq"])}</h2>\n'
                    f'{details_html}'
                    f'        </section>\n'
                )

            full_body = (
                f'        <p class="cf-muted cf-tip__meta">{escape(pub_date)} · {escape(category)} · {escape(prog_lang.upper())}</p>\n'
                f"{body_html}\n"
                f"{faq_section}"
                f'        <p><a class="cf-btn cf-btn--primary cf-fix__cta" href="{escape(cta_href, quote=True)}">{escape(ui["try"])}</a></p>\n'
                f"{fix_block}"
                f"{rel_block}"
            )

            graph: list[dict] = [
                {
                    "@type": "TechArticle",
                    "headline": title,
                    "description": desc,
                    "inLanguage": loc,
                    "articleSection": category,
                    "keywords": f"{prog_lang}, code formatter, auto-doc ai, syntax, best practices",
                    "datePublished": pub_date,
                    "dateModified": pub_date,
                    "url": url,
                    "mainEntityOfPage": {"@type": "WebPage", "@id": url},
                    "isPartOf": {"@type": "WebApplication", "name": "Code Formatter & Auto-Doc AI", "url": f"{SITE}{TOOL_PATH}"},
                    "image": og_img,
                    "author": {"@type": "Organization", "name": "JW Solutions"},
                    "publisher": {"@type": "Organization", "name": "JW Solutions", "url": SITE},
                },
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Code Formatter", "item": f"{SITE}{TOOL_PATH}"},
                        {"@type": "ListItem", "position": 2, "name": category, "item": f"{SITE}{TOOL_PATH}{cat_path}"},
                        {"@type": "ListItem", "position": 3, "name": title, "item": url},
                    ],
                },
            ]
            if valid_faq:
                graph.append(
                    {
                        "@type": "FAQPage",
                        "inLanguage": loc,
                        "mainEntity": [
                            {
                                "@type": "Question",
                                "name": str(item["q"]),
                                "acceptedAnswer": {"@type": "Answer", "text": str(item["a"])},
                            }
                            for item in valid_faq
                        ],
                    }
                )
            ld = {"@context": "https://schema.org", "@graph": graph}

            html_page = _fill(
                FIX_PAGE,
                TITLE=escape(title),
                DESC=escape(desc),
                URL=escape(url, quote=True),
                ALTERNATES=alternates,
                RSS_LANG=escape(loc),
                SQUAD_LABEL=escape(SQUAD_LABELS.get(loc, SQUAD_LABELS["es"])),
                OG=escape(og_img, quote=True),
                TOOL="../../../../",
                REPO="../../../../../../",
                DATA="",
                MAINATTRS="",
                TAG=escape(category),
                H1=escape(title),
                LEAD=escape(desc),
                BODY=full_body,
                JSONLD='  <script type="application/ld+json" id="cf-jsonld">' + json.dumps(ld, ensure_ascii=False) + "</script>",
            )
            html_page = html_page.replace('<html lang="es">', f'<html lang="{escape(loc)}">', 1)
            html_page = html_page.replace('content="es_ES"', f'content="{OG_LOCALE.get(loc, "en_US")}"', 1)
            fallback_cards = _build_tips_fallback_cards("../../../../", loc)
            showcase_html = _tips_showcase_block("../../../../", loc, fallback_cards)
            unified_footer = _unified_footer_html("../../../../", SQUAD_LABELS.get(loc, SQUAD_LABELS["es"]))
            academy_level = int(tip.get("academy_level") or 1)
            share_bar = _share_bar_html(url, title, loc)
            academy_cta = _academy_cta_block("../../../../", loc, prog_lang, slug, level=academy_level, source="tips_article")
            html_page = re.sub(
                r"  <footer class=\"cf-footer\">[\s\S]*?  </footer>",
                f"{share_bar}\n\n{academy_cta}\n\n{showcase_html}\n\n{unified_footer}\n\n{TIP_DETAIL_MODAL_HTML}",
                html_page,
                count=1,
            )
            html_page = html_page.replace(
                '<script type="module" src="../../../../../../assets/js/tools/code-formatter/fix-page.js"></script>',
                '<script type="module" src="../../../../../../assets/js/tools/code-formatter/tips-carousel.js"></script>',
                1,
            )
            out[f"tools/code-formatter/{cat_path}{slug}/{loc}/index.html"] = html_page
            if loc == "es":
                out[f"tools/code-formatter/{cat_path}{slug}/index.html"] = (
                    html_page.replace("../../../../../../", "../../../../../").replace("../../../../", "../../../")
                )

    return out


def write_tip_pages(*roots: Path) -> list[str]:
    pages = tip_pages()
    for root in roots:
        for rel, content in pages.items():
            dst = root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(content, encoding="utf-8", newline="\n")
    return sorted(pages)


def _rfc822_date(iso_date: str) -> str:
    try:
        d = date.fromisoformat(iso_date[:10])
        dt = datetime(d.year, d.month, d.day, 14, 0, 0, tzinfo=timezone.utc)
    except Exception:
        dt = datetime.now(timezone.utc)
    return format_datetime(dt)


def rss_feeds() -> dict[str, str]:
    """Genera tools/code-formatter/tips/feed.xml (EN) y feed.<lang>.xml para los 7 idiomas."""
    tips = _load_published_tips()[:20]
    out: dict[str, str] = {}
    atom_links = "\n".join(
        f'    <atom:link rel="alternate" type="application/rss+xml" hreflang="{escape(l)}" href="{SITE}{TOOL_PATH}tips/feed.{escape(l)}.xml"/>'
        for l in SITEMAP_LANGS
    )

    def build_feed(loc: str, self_name: str) -> str:
        items_xml: list[str] = []
        tips_dir = ROOT / "content" / "code-formatter-tips"
        for t in tips:
            tr = t if loc == "es" else t.get("translations", {}).get(loc)
            if not tr:
                continue
            prog_lang = t.get("programming_language") or t.get("language") or "python"
            cat_path = TIP_CATEGORY_PATH.get(prog_lang, "tips/python/")
            link = f"{SITE}{TOOL_PATH}{cat_path}{t['slug']}/{loc}/"
            title = tr.get("title") or t["title"]
            desc = tr.get("summary") or tr.get("meta_description") or title
            pub = _rfc822_date(t.get("published_at") or t.get("date") or date.today().isoformat())

            encoded_parts = [f"<p>{escape(desc)}</p>"]
            md_rel = tr.get("file") or (f"published/{t['slug']}.md" if loc == "es" else f"published/{t['slug']}.{loc}.md")
            md_path = tips_dir / md_rel
            if md_path.is_file():
                _, md_body = _strip_frontmatter(md_path.read_text(encoding="utf-8"))
                _, _, first_code = _md_to_html(md_body)
                if first_code:
                    encoded_parts.append(f"<pre><code>{escape(first_code)}</code></pre>")
            encoded_parts.append(f'<p><a href="{escape(link, quote=True)}">{escape(title)}</a></p>')
            cdata_html = "".join(encoded_parts).replace("]]>", "]]]]><![CDATA[>")

            og_url = f"{SITE}/assets/images/og/tips/{t['slug']}-{loc}.png"
            items_xml.append(
                f"    <item>\n"
                f"      <title>{escape(title)}</title>\n"
                f"      <link>{escape(link)}</link>\n"
                f"      <guid isPermaLink=\"true\">{escape(link)}</guid>\n"
                f"      <pubDate>{pub}</pubDate>\n"
                f"      <category>{escape(prog_lang.upper())}</category>\n"
                f'      <media:content url="{escape(og_url, quote=True)}" medium="image" />\n'
                f"      <description>{escape(desc)}</description>\n"
                f"      <content:encoded><![CDATA[{cdata_html}]]></content:encoded>\n"
                f"    </item>"
            )
        last_build = format_datetime(datetime.now(timezone.utc))
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">\n'
            "  <channel>\n"
            "    <title>Code Formatter &amp; Auto-Doc AI — Technical Tips</title>\n"
            f"    <link>{SITE}{TOOL_PATH}</link>\n"
            "    <description>Practical syntax guides, refactoring patterns and Auto-Doc AI workflows.</description>\n"
            f"    <language>{escape(loc)}</language>\n"
            f"    <lastBuildDate>{last_build}</lastBuildDate>\n"
            "    <image>\n"
            f"      <url>{OG_DEFAULT}</url>\n"
            "      <title>Code Formatter &amp; Auto-Doc AI — Technical Tips</title>\n"
            f"      <link>{SITE}{TOOL_PATH}</link>\n"
            "    </image>\n"
            f'    <atom:link rel="self" type="application/rss+xml" href="{SITE}{TOOL_PATH}tips/{escape(self_name)}"/>\n'
            f"{atom_links}\n"
            + "\n".join(items_xml)
            + "\n  </channel>\n</rss>\n"
        )

    out["tools/code-formatter/tips/feed.xml"] = build_feed("en", "feed.xml")
    for l in SITEMAP_LANGS:
        out[f"tools/code-formatter/tips/feed.{l}.xml"] = build_feed(l, f"feed.{l}.xml")
    return out


def write_rss_feeds(*roots: Path) -> list[str]:
    feeds = rss_feeds()
    for root in roots:
        for rel, content in feeds.items():
            dst = root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(content, encoding="utf-8", newline="\n")
    return sorted(feeds)


def sitemap_xml() -> str:
    """sitemap-code-formatter.xml: herramienta + páginas de tips (7 idiomas) + cada tip en los idiomas con contenido real.

    Cada URL lleva sus alternates xhtml:link cruzados y x-default (español). Los tips solo declaran los idiomas
    que tienen traducción publicada, igual que el hreflang dinámico de tips-page.js."""
    tips = json.loads(TIPS_MANIFEST.read_text(encoding="utf-8")).get("tips", []) if TIPS_MANIFEST.is_file() else []
    today = date.today().isoformat()

    def url(path: str, lang: str, tip: str | None = None) -> str:
        query = [f"lang={lang}"] if lang != "es" else []
        if tip:
            query.append(f"tip={tip}")
        return f"{SITE}{path}" + (("?" + "&amp;".join(query)) if query else "")

    def block(path: str, langs: list[str], lastmod: str, priority: str, tip: str | None = None) -> str:
        links = "".join(f'    <xhtml:link rel="alternate" hreflang="{x}" href="{url(path, x, tip)}"/>\n' for x in langs)
        links += f'    <xhtml:link rel="alternate" hreflang="x-default" href="{url(path, "es", tip)}"/>\n'
        return "".join(
            f"  <url>\n    <loc>{url(path, l, tip)}</loc>\n{links}    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n    <priority>{priority}</priority>\n  </url>\n"
            for l in langs
        )

    newest = max((t["published_at"] for t in tips), default=today)
    out = block(TOOL_PATH, SITEMAP_LANGS, newest, "0.9")
    for category in ("tips/python/", "tips/javascript/", "tips/sql-dax/"):
        out += block(TOOL_PATH + category, SITEMAP_LANGS, newest, "0.6")
    for tip in tips:
        prog_lang = tip.get("programming_language") or tip["language"]
        cat_path = TIP_CATEGORY_PATH.get(prog_lang, "tips/python/")
        langs = [l for l in SITEMAP_LANGS if l == "es" or l in tip.get("translations", {})]
        tip_base = f"{SITE}{TOOL_PATH}{cat_path}{tip['slug']}/"
        tip_links = "".join(f'    <xhtml:link rel="alternate" hreflang="{x}" href="{tip_base}{x}/"/>\n' for x in langs)
        tip_links += f'    <xhtml:link rel="alternate" hreflang="x-default" href="{tip_base}es/"/>\n'
        for l in langs:
            out += (
                f"  <url>\n    <loc>{tip_base}{l}/</loc>\n{tip_links}"
                f"    <lastmod>{tip['published_at']}</lastmod>\n"
                f"    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n"
            )
    if FIX_SRC.is_file():
        fixes = load_fixes()
        out += block(TOOL_PATH + "fix/", SITEMAP_LANGS, fixes["published_at"], "0.7")
        for fx in fixes["errors"]:
            out += block(TOOL_PATH + f"fix/{fx['slug']}/", SITEMAP_LANGS, fixes["published_at"], "0.8")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        f"{out}</urlset>\n"
    )


def write_sitemap(*targets: Path) -> str:
    xml = sitemap_xml()
    for target in targets:
        target.write_text(xml, encoding="utf-8")
    return xml


def load_matrix() -> dict:
    return json.loads(MATRIX.read_text(encoding="utf-8"))


def runtime_doc(features: list[dict]) -> dict:
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": [{"id": f["id"], "tier": f["tier"], "active": True} for f in features],
    }


def write_dev_runtime(matrix: dict) -> None:
    active = [f for f in matrix["features"] if f["status"] == "ready"]
    path = ROOT / RUNTIME_REL
    path.write_text(json.dumps(runtime_doc(active), indent=2) + "\n", encoding="utf-8")
    print(f"[dev] {path.relative_to(ROOT)}: {len(active)} funciones activas (free + pay)")


def _build_tips_fallback_cards(tool_rel: str = "", lang_code: str = "es") -> str:
    """Genera tarjetas SEO estáticas para el bloque de respaldo del carrusel."""
    if not TIPS_MANIFEST.is_file():
        return ""
    manifest = json.loads(TIPS_MANIFEST.read_text(encoding="utf-8"))
    tips = list(reversed(manifest.get("tips", [])))
    cards = []
    for tip in tips:
        cat_path = TIP_CATEGORY_PATH.get(tip.get("language", "python"), "tips/python/")
        slug = escape(tip.get("slug", ""))
        tr = tip if lang_code == "es" else (tip.get("translations", {}).get(lang_code) or tip)
        target_loc = lang_code if (lang_code == "es" or lang_code in tip.get("translations", {})) else "es"
        title = escape(tr.get("title") or tip.get("title", slug))
        lang_label = escape(str(tip.get("language", "")).upper())
        pub = escape(str(tip.get("published_at", "")))
        href = f"{tool_rel}{cat_path}{slug}/{target_loc}/"
        cards.append(
            f'          <article class="cf-card cf-tip-carousel-card">\n'
            f'            <div class="cf-tip-carousel-card__head"><span class="cf-lang-badge">{lang_label}</span>'
            f'<time class="cf-tip-carousel-card__date" datetime="{pub}">{pub}</time></div>\n'
            f'            <h3 class="cf-tip-carousel-card__title"><a href="{href}">{title}</a></h3>\n'
            f'          </article>'
        )
    return "\n".join(cards)


def _tips_showcase_block(tool_rel: str, rss_lang: str, fallback_cards: str) -> str:
    """Sección interactiva Weekly Tips + 7 canales automáticos + modal de vista rápida."""
    return f"""  <section class="cf-tips-showcase" id="cf-weekly-tips" aria-labelledby="cf-tips-showcase-title">
    <div class="cf-container">
      <div class="cf-tips-showcase__head">
        <div class="cf-tips-showcase__intro">
          <span class="cf-tag" data-i18n="tipsShowcaseTag">Actualizaciones &amp; Guías Técnicas</span>
          <h2 id="cf-tips-showcase-title" class="cf-tips-showcase__title" data-i18n="tipsShowcaseTitle">Weekly Tips de Código y Buenas Prácticas</h2>
          <p class="cf-muted cf-tips-showcase__sub" data-i18n="tipsShowcaseSubtitle">Guías prácticas por lenguaje, estándares modernos y ejemplos listos para probar en el editor.</p>
        </div>
        <span id="cf-tips-count" class="cf-badge cf-tips-showcase__count" aria-live="polite"></span>
      </div>

      <div class="cf-channels-bar" role="region" data-i18n-aria="tipsChannelsLabel" aria-label="Disponible también en nuestros canales automáticos:">
        <span class="cf-channels-bar__label" data-i18n="tipsChannelsLabel">Disponible también en nuestros canales automáticos:</span>
        <div class="cf-channels-bar__list">
          <a class="cf-channel-link" href="https://dev.to/jwsolutions" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelDevto" aria-label="Dev.to" title="Dev.to">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.42 10.05c-.18-.16-.46-.23-.84-.23H6v4.36h.58c.37 0 .65-.08.84-.23.21-.16.31-.46.31-.92v-2.06c0-.46-.1-.76-.31-.92zM20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM9.06 13.09c0 .77-.21 1.38-.62 1.81-.42.44-1.02.66-1.81.66H4.7V8.44h1.95c.78 0 1.37.21 1.79.64.42.42.62 1.01.62 1.77v2.24zm4.82-3.27h-2.1v1.45h1.5v1.36h-1.5v1.55h2.1v1.38h-3.54V8.44h3.54v1.38zm5.16 5.74h-1.4l-1.56-5.26-.04-.17-.04.17-.95 5.26h-1.4l-1.36-7.12h1.45l.68 4.41.05.33.06-.33.92-4.41h1.21l.93 4.41.06.33.05-.33.68-4.41h1.42l-1.36 7.12z"/></svg>
          </a>
          <a class="cf-channel-link" href="https://bsky.app/profile/jwsolutions.bsky.social" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelBluesky" aria-label="Bluesky" title="Bluesky">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.74 8.74 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>
          </a>
          <a class="cf-channel-link" href="https://t.me/+rZphEi3JWxFlMDJh" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelTelegram" aria-label="Telegram (Canal Oficial)" title="Telegram">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
          </a>
          <a id="cf-channel-discord" class="cf-channel-link" href="https://discord.gg/f2nXYUXXwA" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelDiscord" aria-label="Discord Community" title="Discord">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          </a>
          <a class="cf-channel-link" href="https://github.com/jw-solutions/jw-solutions-website/discussions" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelGithub" aria-label="GitHub Discussions" title="GitHub Discussions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11.04 11.04 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
          </a>
          <a class="cf-channel-link" href="https://dly.to/nmdN9vQObOU" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelDailydev" aria-label="daily.dev Squad" title="daily.dev Squad">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3zm-7 5.4l6 3.3v6.7l-6-3.3V9.7zm8 10v-6.7l6-3.3v6.7l-6 3.3z"/></svg>
          </a>
          <a id="cf-channel-rss" class="cf-channel-link" href="{tool_rel}tips/feed.{escape(rss_lang)}.xml" target="_blank" rel="noopener noreferrer" data-i18n-aria="tipsChannelRss" aria-label="RSS Feed Multilingüe" title="RSS Feed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20 4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
          </a>
        </div>
      </div>

      <div class="cf-tips-controls">
        <div id="cf-tips-filters" class="cf-tips-filters" role="tablist" data-i18n-aria="tipsFilterAria" aria-label="Filtrar guías por lenguaje"></div>
        <div class="cf-tips-nav">
          <button type="button" id="cf-tips-prev" class="cf-btn cf-btn--small cf-tips-nav__btn" data-i18n-aria="tipsPrevSlide" aria-label="Desplazar a la izquierda">&larr;</button>
          <button type="button" id="cf-tips-toggle" class="cf-btn cf-btn--small cf-tips-nav__btn" data-i18n-aria="tipsPauseCarousel" aria-label="Pausar desplazamiento" aria-pressed="false">&#x23F8;</button>
          <button type="button" id="cf-tips-next" class="cf-btn cf-btn--small cf-tips-nav__btn" data-i18n-aria="tipsNextSlide" aria-label="Desplazar a la derecha">&rarr;</button>
        </div>
      </div>

      <div id="cf-tips-viewport" class="cf-tips-viewport" role="region" data-i18n-aria="tipsCarouselAria" aria-label="Carrusel de guías técnicas">
        <div id="cf-tips-track" class="cf-tips-track">
          <!-- CF_TIPS_FALLBACK_START -->
{fallback_cards}
          <!-- CF_TIPS_FALLBACK_END -->
        </div>
      </div>
    </div>
  </section>"""


TIP_DETAIL_MODAL_HTML = """  <dialog id="cf-tip-detail-modal" class="cf-dialog cf-tip-modal" aria-labelledby="cf-tip-modal-title">
    <div class="cf-dialog__head">
      <div class="cf-tip-modal__meta">
        <span id="cf-tip-modal-lang" class="cf-lang-badge"></span>
        <time id="cf-tip-modal-date" class="cf-muted"></time>
      </div>
      <button type="button" class="cf-btn cf-btn--small" data-cf-close data-i18n="tipsModalClose">Cerrar</button>
    </div>
    <h2 id="cf-tip-modal-title" class="cf-dialog__title cf-tip-modal__title"></h2>
    <div id="cf-tip-modal-tags" class="cf-tip-carousel-card__tags"></div>
    <p id="cf-tip-modal-summary" class="cf-tip-modal__summary"></p>
    <div id="cf-tip-modal-code-wrap" class="cf-tip-modal__code-wrap" hidden>
      <p class="cf-field__label" data-i18n="tipsCodePreview">Ejemplo de código</p>
      <pre class="cf-tip__code"><code id="cf-tip-modal-code"></code></pre>
    </div>
    <div class="cf-tip-modal__actions">
      <a id="cf-tip-modal-full" class="cf-btn cf-btn--primary" href="#" data-i18n="tipsOpenFullPage">Leer guía completa y FAQ</a>
      <button type="button" id="cf-tip-modal-load" class="cf-btn" data-i18n="tipsLoadInEditor">Cargar ejemplo en el editor</button>
    </div>
    <div id="cf-tip-modal-share"></div>
  </dialog>"""


def _unified_footer_html(tool_rel: str, squad_label: str) -> str:
    return f"""  <footer class="cf-footer">
    <div class="cf-container cf-footer__grid cf-footer__grid--two">
      <section class="cf-footer__col" aria-labelledby="cf-foot-id">
        <div class="cf-logo" role="img" aria-label="JW Solutions">
          <span class="cf-logo__mark">JW</span>
          <span class="cf-logo__text">SOLUTIONS</span>
        </div>
        <h2 id="cf-foot-id" class="cf-footer__title">Code Formatter <span class="cf-gold">&amp; Auto-Doc AI</span></h2>
        <p class="cf-footer__text" data-i18n="footDesc">Formatea y documenta tu código en Python, JavaScript, SQL, DAX y más. Herramienta independiente de JW Solutions.</p>
        <ul class="cf-footer__list">
          <li><a href="{tool_rel}" data-site-link data-i18n="footEditor">Ir al editor</a></li>
          <li><a href="{tool_rel}fix/" data-site-link data-i18n="fixHubTitle">Soluciones rápidas a errores de sintaxis</a></li>
          <li><a href="https://dly.to/nmdN9vQObOU" target="_blank" rel="noopener noreferrer" data-i18n="footDailyDevSquad">{escape(squad_label)}</a></li>
        </ul>
      </section>

      <section class="cf-footer__col" aria-labelledby="cf-foot-nl">
        <h2 id="cf-foot-nl" class="cf-footer__title" data-i18n="nlTitle">Tips Semanales de Código</h2>
        <p class="cf-footer__text" data-i18n="nlPromise">Un email por semana con tips prácticos de sintaxis, casos de estudio y novedades de lenguajes (Python, JS, SQL, DAX). Sin spam, sin ruido. Puedes darte de baja en cualquier momento.</p>
        <form id="cf-newsletter-form" class="cf-newsletter" novalidate>
          <label class="cf-sr-only" for="cf-newsletter-email" data-i18n="nlEmailLabel">Correo electrónico</label>
          <input id="cf-newsletter-email" class="cf-input" type="email" name="email" required maxlength="254" autocomplete="email" placeholder="tu@email.com" data-i18n-placeholder="nlPlaceholder">
          <input type="text" name="_gotcha" class="cf-sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button type="submit" class="cf-btn cf-btn--primary" data-i18n="nlSubmit">Suscribirme</button>
          <p id="cf-newsletter-status" class="cf-form__status cf-newsletter__status" role="status" aria-live="polite"></p>
        </form>
      </section>
    </div>
    <div class="cf-container cf-footer__legal">
      <p>&copy; JW Solutions · <span data-i18n="footRights">Todos los derechos reservados</span> · <a href="/privacidad/" data-site-link data-i18n="legalPrivacy">Política de Privacidad</a> · <a href="/terminos/" data-site-link data-i18n="legalTerms">Términos de Servicio</a></p>
    </div>
  </footer>"""


def inject_tips_fallback(root: Path) -> int:
    """Inyecta tarjetas SEO estáticas de todos los tips publicados en index.html y páginas de categoría."""
    cards_root = _build_tips_fallback_cards("", "es")
    cards_cat = _build_tips_fallback_cards("../../", "es")
    targets = [
        (root / "tools" / "code-formatter" / "index.html", cards_root),
        (root / "tools" / "code-formatter" / "tips" / "python" / "index.html", cards_cat),
        (root / "tools" / "code-formatter" / "tips" / "javascript" / "index.html", cards_cat),
        (root / "tools" / "code-formatter" / "tips" / "sql-dax" / "index.html", cards_cat),
    ]
    total = 0
    for path, cards in targets:
        if not path.is_file() or not cards:
            continue
        block = f"<!-- CF_TIPS_FALLBACK_START -->\n{cards}\n          <!-- CF_TIPS_FALLBACK_END -->"
        html = path.read_text(encoding="utf-8")
        updated, count = re.subn(
            r"<!-- CF_TIPS_FALLBACK_START -->[\s\S]*?<!-- CF_TIPS_FALLBACK_END -->",
            block,
            html,
            count=1,
        )
        if count and updated != html:
            path.write_text(updated, encoding="utf-8")
        total += 1
    return total


def build_public(matrix: dict) -> int:
    free = [f for f in matrix["features"] if f["tier"] == "free" and f["status"] == "ready"]
    pay_files = {p for f in matrix["features"] if f["tier"] == "pay" for p in f["files"]}
    to_copy = list(matrix["shared_files"]) + [p for f in free for p in f["files"]]
    # Contenido de tips (manifiesto + publicados): lo lee tips-page.js en tiempo de ejecución
    tips_dir = ROOT / "content" / "code-formatter-tips"
    to_copy.append("content/code-formatter-tips/code-formatter-manifest.json")
    to_copy += [f"content/code-formatter-tips/published/{m.name}" for m in sorted((tips_dir / "published").glob("*.md"))]
    # Contenido público de Academia (solo niveles free 1-2 y catálogo ligero de rutas/retos diarios)
    academy_dir = ROOT / "content" / "code-formatter-academy"
    if academy_dir.is_dir():
        to_copy += [m.relative_to(ROOT).as_posix() for m in sorted(academy_dir.rglob("*.json"))]
    inject_tips_fallback(ROOT)
    to_copy += write_fix_pages(ROOT)  # landings /fix/ (se generan en el repo: GitHub Pages sirve la raíz)
    to_copy += write_tip_pages(ROOT)  # páginas estáticas localizadas de tips
    to_copy += write_rss_feeds(ROOT)  # feeds RSS multilingües
    to_copy += [m.relative_to(ROOT).as_posix() for m in sorted((ROOT / "assets" / "images" / "og").rglob("*.png"))]  # imágenes OpenGraph

    missing = [p for p in to_copy if not (ROOT / p).is_file()]
    if missing:
        print("ERROR: archivos free/compartidos inexistentes:", *missing, sep="\n  - ")
        return 1
    leaked = pay_files.intersection(to_copy)
    if leaked:
        print("ERROR: archivos pay listados como free/compartidos:", *sorted(leaked), sep="\n  - ")
        return 1

    if DIST.exists():
        # Se vacía el contenido en vez de borrar la carpeta: en Windows falla si algo la tiene abierta (p. ej. un servidor)
        for child in DIST.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    manifest = {}
    for rel in sorted(set(to_copy)):
        src, dst = ROOT / rel, DIST / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(".html"):
            parser = CommercialStripper()
            parser.feed(src.read_text(encoding="utf-8"))
            parser.close()
            dst.write_text("".join(parser.out), encoding="utf-8")
        else:
            shutil.copyfile(src, dst)
        manifest[rel] = hashlib.sha256(dst.read_bytes()).hexdigest()

    runtime = DIST / RUNTIME_REL
    runtime.parent.mkdir(parents=True, exist_ok=True)
    runtime.write_text(json.dumps(runtime_doc(free), indent=2) + "\n", encoding="utf-8")
    manifest[str(RUNTIME_REL).replace("\\", "/")] = hashlib.sha256(runtime.read_bytes()).hexdigest()
    manifest[SITEMAP_NAME] = hashlib.sha256(write_sitemap(ROOT / SITEMAP_NAME, DIST / SITEMAP_NAME).encode("utf-8")).hexdigest()
    (DIST / "BUILD_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Verificación de aislamiento
    problems = []
    for rel in pay_files:
        if (DIST / rel).exists():
            problems.append(f"archivo pay presente: {rel}")
    for html in DIST.rglob("*.html"):
        if "data-cf-commercial" in html.read_text(encoding="utf-8"):
            problems.append(f"elemento comercial presente en {html.relative_to(DIST)}")
    if any(f["tier"] != "free" for f in json.loads(runtime.read_text(encoding="utf-8"))["features"]):
        problems.append("features.runtime.json contiene funciones no free")
    if problems:
        print("ERROR de aislamiento:", *problems, sep="\n  - ")
        return 1

    print(f"OK dist-public/: {len(manifest) - 1} archivos, {len(free)} funciones free, 0 recursos pay")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dev", action="store_true", help="solo genera features.runtime.json de desarrollo")
    ap.add_argument("--fix", action="store_true", help="solo regenera las landings tools/code-formatter/fix/")
    ap.add_argument("--tips", action="store_true", help="solo regenera las páginas estáticas localizadas de tips")
    ap.add_argument("--rss", action="store_true", help="solo regenera los feeds RSS multilingües")
    ap.add_argument("--sitemap", action="store_true", help="solo regenera sitemap-code-formatter.xml en la raíz del repo")
    args = ap.parse_args()
    if args.fix:
        print(f"OK {len(write_fix_pages(ROOT))} archivos en {FIX_REL}/")
        return 0
    if args.tips:
        print(f"OK {len(write_tip_pages(ROOT))} páginas estáticas de tips")
        return 0
    if args.rss:
        print(f"OK {len(write_rss_feeds(ROOT))} feeds RSS")
        return 0
    if args.sitemap:
        write_sitemap(ROOT / SITEMAP_NAME)
        print(f"OK {SITEMAP_NAME}")
        return 0
    matrix = load_matrix()
    if args.dev:
        write_dev_runtime(matrix)
        return 0
    return build_public(matrix)


if __name__ == "__main__":
    sys.exit(main())
