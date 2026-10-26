#!/usr/bin/env python3
"""Genera dist-public/ con solo los recursos de tier "free" del Code Formatter.

Uso:
    python scripts/code-formatter/build_public.py            # construye dist-public/
    python scripts/code-formatter/build_public.py --dev      # solo escribe el features.runtime.json de desarrollo (todo activo)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "config" / "features-matrix.json"
RUNTIME_REL = Path("tools/code-formatter/features.runtime.json")
DIST = ROOT / "dist-public"
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
    args = ap.parse_args()
    matrix = load_matrix()
    if args.dev:
        write_dev_runtime(matrix)
        return 0
    return build_public(matrix)


if __name__ == "__main__":
    sys.exit(main())
