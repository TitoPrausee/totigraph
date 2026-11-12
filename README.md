# Totigraph

Ein heller, minimalistischer Diagramm-Viewer im Whiteboard-Stil —
schwebende Werkzeug-Pillen, unendlicher Canvas mit Grid, Pan/Zoom/Pinch
wie von einem Whiteboard-Tool gewohnt. Diagramme werden als Mermaid-
Quellen eingebettet und clientseitig gerendert.

**Statisch. Kein Build-Step. Kein Server-Backend. Keine externen Requests.**

```
index.html          ← Template mit Platzhaltern (FILLED_BY_JS, __EMBED_MAP__)
build.py            ← bettet .mmd-Quellen ein → dist/index.html
dist/               ← Build-Output (index.html + vendor/)
vendor/mermaid.min.js
diagrams/*.mmd      ← Deine Mermaid-Quellen
```

## Quickstart

```bash
python3 build.py
python3 -m http.server 8080 --directory dist
# → http://localhost:8080
```

Eigene Diagramme: `.mmd`-Dateien in `diagrams/` legen und in `build.py`
die Liste `FILES` + die Beschreibungen in `META` (index.html-Template)
anpassen. Alles wird beim Build direkt ins HTML eingebettet — die Seite
läuft danach ohne Netz.

## Bedienung

| Aktion | Eingabe |
|---|---|
| Schwenken | Ziehen · `Space` + Ziehen |
| Zoomen | Scrollen (am Cursor) · Pinch (Trackpad/Touch) |
| Einpassen | Doppelklick · `0` · `Alt+1` |
| Zoom 100 % | Toolbar-Button |
| Zoom ± | Buttons · `+` / `-` |
| Minimap | `M` |
| Diagramm-Index | Toolbar · Panel-Klick |
| Diagrammwechsel | `Alt+←` / `Alt+→` · Pfeile im Titel-Chip |
| Hand / Cursor | `H` / `V` |

Deep-Links: `#1`–`#6` wählt das Diagramm.

## Features

- **Weißer Canvas mit Linien-Grid**, Grid skaliert/pannt mit dem Viewport mit
- **Zoom am Cursor** mit exponentieller Glättung, Trackpad-Pinch beschleunigt
- **Zwei-Finger-Pinch** zoomt am Finger-Mittelpunkt
- **Minimap** mit Diagramm-Bounding-Box und Viewport-Rechteck, klickbar
- **Diagrammwechsel** ohne Nachladen (Quellen eingebettet), fit-zentriert pro Wechsel
- **Mermaid-Theming**: weiße Knoten mit Outline, blaue Cluster, gelbe Notes —
  Inline-Styles im SVG werden deterministisch normalisiert (`normalizeSvg`)
- **Tastatur-Shortcuts** im Whiteboard-Modell (`V`, `H`, `M`, `0`, `+`, `-`)
- Responsive: Rail wird mobil zur horizontalen Tab-Leiste
- `prefers-reduced-motion` respektiert

## Design

Light-Theme, Referenz-Stil: Canvas `#f2f2f2` mit Grid-Linien, weiße
schwebende Pills mit weichem Schatten, Akzent `#4262ff`, Tinte `#050038`,
Outline-Icons. Kein Framework, reines CSS (`--`-Custom-Properties oben
in der Datei — zum Umfärben reicht das Umbenennen der Tokens).

## Lizenz

MIT
