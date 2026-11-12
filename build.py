#!/usr/bin/env python3
"""Build: bettet Diagramm-Daten + Renderer in index.html ein → dist/.

Zwei Diagramm-Quellen:
  diagrams/*.mmd          — Mermaid-Quellen (Rohdaten, Import-Referenz)
  diagrams-native*.js     — natives Board-Layout (Data-Model)

Ablauf:
  1. index.html lesen
  2. __EMBED_MAP__ durch JSON der Mermaid-Quellen ersetzen
  3. /*__NATIVE__*/ durch eingebettete JS-Module ersetzen
     (Layouts + native-render + board-kit)
  4. dist/ schreiben (index.html + vendor/)

Die Seite braucht kein Netz: JS + Diagramm-Daten landen direkt im HTML.
"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "index.html")
DIAGRAMS = os.path.join(ROOT, "diagrams")
NATIVE_FILES = ["diagrams-native.js", "diagrams-native-seq.js"]
NATIVE_RENDER = os.path.join(ROOT, "native-render.js")
BOARD_KIT = os.path.join(ROOT, "board-kit.js")
TOUCH_GESTURES = os.path.join(ROOT, "touch-gestures.js")
VENDOR = os.path.join(ROOT, "vendor")
DIST = os.path.join(ROOT, "dist")

html = open(SRC, encoding="utf-8").read()

# 1) Native Diagramm-Layouts + Renderer einbetten
native_src = ""
for f in NATIVE_FILES:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        sys.exit("Fehlt: " + f)
    native_src += open(p, encoding="utf-8").read().strip() + "\n\n"
native_src += open(NATIVE_RENDER, encoding="utf-8").read().strip() + "\n"
native_src += open(BOARD_KIT, encoding="utf-8").read().strip() + "\n"
native_src += open(TOUCH_GESTURES, encoding="utf-8").read().strip() + "\n"
# Login: macht nginx (auth_basic + error_page → uml-login.html am Testserver).
# Kein JS-Gate hier — GitHub-Demo bleibt öffentlich, Testserver hat Server-Wall.

if "/*__NATIVE__*/" not in html:
    sys.exit("Template unvollständig: /*__NATIVE__*/ Platzhalter fehlt.")
html = html.replace("/*__NATIVE__*/", native_src)

# 2) Mermaid-Bundle als Rohdatenquelle einbetten
if "FILLED_BY_JS" in html or "__EMBED_MAP__" not in html:
    sys.exit("Template unvollständig: FILLED_BY_JS / __EMBED_MAP__ Platzhalter fehlen.")
files = sorted(f for f in os.listdir(DIAGRAMS) if f.endswith(".mmd"))
if not files:
    sys.exit("Keine .mmd-Dateien in diagrams/ gefunden.")
bundle = {}
for f in files:
    with open(os.path.join(DIAGRAMS, f), encoding="utf-8") as fh:
        bundle[f] = fh.read().strip()
html = html.replace("FILLED_BY_JS", "").replace("__EMBED_MAP__", json.dumps(bundle, ensure_ascii=False))

os.makedirs(DIST, exist_ok=True)
with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
    fh.write(html)

vendor_dst = os.path.join(DIST, "vendor")
if os.path.isdir(vendor_dst):
    shutil.rmtree(vendor_dst)
shutil.copytree(VENDOR, vendor_dst)

print(f"Build OK: {len(bundle)} Mermaid-Quellen + {len(NATIVE_FILES)} Layout-Module + Renderer → dist/index.html ({os.path.getsize(os.path.join(DIST,'index.html'))} bytes)")
print("Start:  python3 -m http.server 8080 --directory dist")
