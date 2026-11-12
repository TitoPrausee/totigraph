#!/usr/bin/env python3
"""Build: bettet Mermaid-Quellen aus diagrams/ in index.html ein → dist/.

Die Seite braucht kein Netz: Diagramm-Texte landen als JSON-Literal
direkt im HTML, Mermaid liegt lokal unter vendor/.
"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "index.html")
DIAGRAMS = os.path.join(ROOT, "diagrams")
VENDOR = os.path.join(ROOT, "vendor")
DIST = os.path.join(ROOT, "dist")

# Diagramm-Dateien in fester Reihenfolge (Nummerierung = Reihenfolge im UI)
FILES = sorted(f for f in os.listdir(DIAGRAMS) if f.endswith(".mmd"))
if not FILES:
    sys.exit("Keine .mmd-Dateien in diagrams/ gefunden.")

bundle = {}
for f in FILES:
    with open(os.path.join(DIAGRAMS, f), encoding="utf-8") as fh:
        bundle[f] = fh.read().strip()

html = open(SRC, encoding="utf-8").read()
if "FILLED_BY_JS" in html or "__EMBED_MAP__" not in html:
    sys.exit("Template unvollständig: FILLED_BY_JS / __EMBED_MAP__ Platzhalter fehlen.")

html = html.replace("FILLED_BY_JS", "").replace("__EMBED_MAP__", json.dumps(bundle, ensure_ascii=False))

os.makedirs(DIST, exist_ok=True)
with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
    fh.write(html)

vendor_dst = os.path.join(DIST, "vendor")
if os.path.isdir(vendor_dst):
    shutil.rmtree(vendor_dst)
shutil.copytree(VENDOR, vendor_dst)

print(f"Build OK: {len(bundle)} Diagramme → dist/index.html ({os.path.getsize(os.path.join(DIST, 'index.html'))} bytes)")
print("Start:  python3 -m http.server 8080 --directory dist")
