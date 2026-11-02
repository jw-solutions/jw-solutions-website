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
from html import escape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "config" / "features-matrix.json"
RUNTIME_REL = Path("tools/code-formatter/features.runtime.json")
DIST = ROOT / "dist-public"
SITE = "https://jw-solutions.com"
SITEMAP_NAME = "sitemap-code-formatter.xml"
TIPS_MANIFEST = ROOT / "content" / "code-formatter-tips" / "code-formatter-manifest.json"
SITEMAP_LANGS = ["es", "en", "pt-BR", "pt-PT", "fr", "de", "it"]  # es = URL base sin ?lang=
TOOL_PATH = "/tools/code-formatter/"
TIP_CATEGORY_PATH = {"python": "tips/python/", "javascript": "tips/javascript/", "sql": "tips/sql-dax/", "dax": "tips/sql-dax/"}
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
  <meta name="cf-newsletter-endpoint" content="https://formspree.io/f/mbggprea">
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
      <p>&copy; JW Solutions · <span data-i18n="footRights">Todos los derechos reservados</span></p>
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


def fix_pages() -> dict[str, str]:
    """{ruta relativa al repo: contenido}. Hub + una landing por error + fix-data.json (textos en 7 idiomas)."""
    cfg = load_fixes()
    errors = cfg["errors"]
    pub = cfg.get("published_at", date.today().isoformat())
    out: dict[str, str] = {}
    data = {"published_at": pub, "errors": {e["slug"]: {k: e[k] for k in ("language", "error", "version", "before", "after", "i18n")} for e in errors}}
    out[f"{FIX_REL}/fix-data.json"] = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    tag = _es("fixTag")

    for e in errors:
        loc = e["i18n"]["es"]
        path = f"{TOOL_PATH}fix/{e['slug']}/"
        url = SITE + path
        steps = loc["steps"]
        ld = {
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "TechArticle", "headline": loc["title"], "description": loc["summary"], "inLanguage": "es", "url": url,
                 "mainEntityOfPage": {"@type": "WebPage", "@id": url}, "image": OG_DEFAULT, "about": {"@type": "Thing", "name": e["error"]},
                 "datePublished": pub, "dateModified": pub, "author": {"@type": "Organization", "name": "JW Solutions"},
                 "publisher": {"@type": "Organization", "name": "JW Solutions", "url": SITE}},
                {"@type": "HowTo", "name": loc["title"], "description": loc["summary"], "inLanguage": "es", "url": url,
                 "step": [{"@type": "HowToStep", "position": i + 1, "name": t, "text": t} for i, t in enumerate(steps)]},
            ],
        }
        others = "".join(f'<li class="cf-card"><a href="../{o["slug"]}/">{escape(o["i18n"]["es"]["title"])}</a></li>' for o in errors if o["slug"] != e["slug"])
        body = (
            f'        <div class="cf-fix__pair"><div><p class="cf-fix__label cf-fix__label--bad">{escape(_es("fixBefore"))}</p><pre class="cf-tip__code"><code>{escape(e["before"])}</code></pre></div>'
            f'<div><p class="cf-fix__label cf-fix__label--good">{escape(_es("fixAfter"))}</p><pre class="cf-tip__code"><code>{escape(e["after"])}</code></pre></div></div>\n'
            f'        <h2 class="cf-tip__h">{escape(_es("fixSteps"))}</h2>\n        <ol class="cf-fix__steps">{"".join(f"<li>{escape(t)}</li>" for t in steps)}</ol>\n'
            f'        <p><a class="cf-btn cf-btn--primary cf-fix__cta" href="../../?sample=1">{escape(_es("fixCta"))}</a></p>\n'
            f'        <h2 class="cf-tip__h">{escape(_es("fixOthers"))}</h2>\n        <ul class="cf-fix__list">{others}</ul>'
        )
        out[f"{FIX_REL}/{e['slug']}/index.html"] = _fill(
            FIX_PAGE, TITLE=escape(loc["title"]), DESC=escape(loc["summary"]), URL=url, ALTERNATES=_alternates(path), OG=OG_DEFAULT, TOOL="../../", REPO="../../../../",
            DATA="../fix-data.json", MAINATTRS=f' data-fix-slug="{e["slug"]}" data-fix-root="../../"', TAG=escape(tag), H1=escape(loc["title"]), LEAD=escape(loc["summary"]), BODY=body,
            JSONLD='  <script type="application/ld+json" id="cf-jsonld">' + json.dumps(ld, ensure_ascii=False) + "</script>",
        )

    hub_path = f"{TOOL_PATH}fix/"
    cards = "".join(
        f'<li class="cf-card"><a href="{e["slug"]}/"><span class="cf-fix__chip">{escape(e["language"])}</span><br>{escape(e["i18n"]["es"]["title"])}</a></li>' for e in errors
    )
    out[f"{FIX_REL}/index.html"] = _fill(
        FIX_PAGE, TITLE=escape(_es("fixHubTitle")), DESC=escape(_es("fixHubLead")), URL=SITE + hub_path, ALTERNATES=_alternates(hub_path), OG=OG_DEFAULT, TOOL="../", REPO="../../../",
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
    for category in dict.fromkeys(TIP_CATEGORY_PATH.values()):
        out += block(TOOL_PATH + category, SITEMAP_LANGS, newest, "0.6")
    for tip in tips:
        langs = [l for l in SITEMAP_LANGS if l == "es" or l in tip.get("translations", {})]
        out += block(TOOL_PATH + TIP_CATEGORY_PATH[tip["language"]], langs, tip["published_at"], "0.7", tip["slug"])
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


def build_public(matrix: dict) -> int:
    free = [f for f in matrix["features"] if f["tier"] == "free" and f["status"] == "ready"]
    pay_files = {p for f in matrix["features"] if f["tier"] == "pay" for p in f["files"]}
    to_copy = list(matrix["shared_files"]) + [p for f in free for p in f["files"]]
    # Contenido de tips (manifiesto + publicados): lo lee tips-page.js en tiempo de ejecución
    tips_dir = ROOT / "content" / "code-formatter-tips"
    to_copy.append("content/code-formatter-tips/code-formatter-manifest.json")
    to_copy += [f"content/code-formatter-tips/published/{m.name}" for m in sorted((tips_dir / "published").glob("*.md"))]
    to_copy += write_fix_pages(ROOT)  # landings /fix/ (se generan en el repo: GitHub Pages sirve la raíz)
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
    ap.add_argument("--sitemap", action="store_true", help="solo regenera sitemap-code-formatter.xml en la raíz del repo")
    args = ap.parse_args()
    if args.fix:
        print(f"OK {len(write_fix_pages(ROOT))} archivos en {FIX_REL}/")
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
