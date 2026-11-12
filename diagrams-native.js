/* ── Board-Diagramme als native Elemente ──────────────────────────
   Jedes Diagramm ist ein Layout aus Frames, Shapes, Stickies,
   DB-Zylindern und Connectoren — wie handgebaut auf einem Board.

   Element-Typen:
     frame   — großer Container mit Titel-Tab (Subgraph)
     shape   — weiße abgerundete Karte (Flowchart-Node, Prozess)
     pill    — Start/Ende (Stadium-Form, vollständig gerundet)
     diamond — Entscheidung (Raute)
     db      — Datenbank-Zylinder
     sticky  — gelbe Notiz (Mermaid-Notes, Legenden)
     seq     — Sequenzdiagramm: special handling (siehe renderSeq)

   Edge: {from, to, label?, dashed?, side?} — Manhattan-Routing.
   Layout: Koordinaten in Welt-Pixeln, handgesetzt pro Diagramm. */

const K = {
  INK: "#050038",
  MUTED: "#5a5e73",
  FAINT: "#9a9aa4",
  LINE: "#5a5e73",
  BLUE: "#4262ff",
  BLUE_SOFT: "rgba(66,98,255,0.08)",
  BLUE_BORDER: "rgba(66,98,255,0.45)",
  YELLOW: "#fff180",
  YELLOW_BORDER: "#d9b900",
  WHITE: "#ffffff",
  CARD_BORDER: "#b6b9c7",
};

/* ════════════════════════════════════════════════════════════════
   1 · Komponentenübersicht (Sucharchitektur)
   Layout: 6 Spalten-Frames: Quellen (links) → ETL → Indizes+Vektor
           → KI → API → Frontend (rechts). Fluss von links nach rechts.
   ════════════════════════════════════════════════════════════════ */
const DIAGRAMS_NATIVE = {};

DIAGRAMS_NATIVE["01-komponenten.mmd"] = (() => {
  const cols = [
    { x: 20,   w: 300, title: "Quellsysteme", color: "blue" },
    { x: 380,  w: 300, title: "ETL-Pipeline · Docker", color: "blue" },
    { x: 740,  w: 300, title: "Indizes · Meilisearch", color: "blue" },
    { x: 1100, w: 300, title: "KI-Dienste · LiteLLM", color: "blue" },
    { x: 1460, w: 300, title: "Search-API", color: "blue" },
    { x: 1820, w: 300, title: "Frontend · React SPA", color: "blue" },
  ];
  const frameH = [810, 620, 620, 620, 620, 620];
  const frames = cols.map((c, i) => ({
    id: "F" + i, type: "frame", x: c.x, y: 60, w: c.w, h: frameH[i], label: c.title
  }));

  // Kardinalitäten: Frame-Innenbreite = 300-2*20 = 260
  const n = (id, fx, y, label, opts={}) => ({
    id, type: opts.type || "shape", label,
    x: cols[fx].x + 20, y, w: 260, h: opts.h || 56, ...opts
  });

  const el = [
    ...frames,
    // Spalte 0: Quellen
    n("QUEEV", 0, 120, "Veranstaltungen", {type:"shape", h:44, frame:"F0", sub:true}),
    n("FRIED", 0, 176, "Friedolin / LVIS"),
    n("INDICO", 0, 244, "Indico"),
    n("MANUELL", 0, 312, "Manuelle Erfassung · Redaktion"),
    n("QUEMED", 0, 388, "Medien", {type:"shape", h:44, frame:"F0", sub:true}),
    n("TOBIRA", 0, 444, "Tobira"),
    n("OPENCAST", 0, 512, "Opencast"),
    n("QUECOUR", 0, 588, "Kurse", {type:"shape", h:44, frame:"F0", sub:true}),
    n("MOODLE", 0, 644, "Moodle"),
    n("VCT", 0, 712, "VCT · Virtual Campus Tools"),
    n("MARKT", 0, 800, "EGOCMS-Marktplatz · WordPress · Ausbau v2", {h:64, dashed:true}),

    // Spalte 1: ETL
    n("SCHED", 1, 120, "Scheduler · Delta-Zyklus alle 15 min", {type:"sticky"}),
    n("HOOK", 1, 196, "Webhook-Receiver · ereignisgesteuert", {type:"sticky"}),
    n("ADAP", 1, 280, "Quell-Adapter · Abruf und Delta-Erkennung"),
    n("NORM", 1, 356, "Normalisierung · Mapping aufs Index-Schema · Deduplizierung", {h:64}),
    n("ANR", 1, 440, "Anreicherung · KI-Schlagwörter · Embeddings", {h:64}),
    n("WR", 1, 524, "Index-Writer · Upsert und Delete"),

    // Spalte 2: Indizes (DB-Zylinder)
    n("IE", 2, 130, "campus_events", {type:"db"}),
    n("IM", 2, 214, "campus_media", {type:"db"}),
    n("IC", 2, 298, "campus_courses", {type:"db"}),
    n("IS", 2, 382, "campus_suggest · optional", {type:"db", dashed:true}),
    n("VDB", 2, 486, "Embedding-Index · Vektorspeicher · Ausbau v2", {type:"db", h:70}),

    // Spalte 3: KI-Dienste
    n("EMB", 3, 130, "Embeddings · bge-m3"),
    n("RER", 3, 206, "Re-Ranker · stable-reranker"),
    n("LLM", 3, 282, "Kleines LLM · NL-Query-Erkennung · KI-Schlagwörter", {h:70}),

    // Spalte 4: API
    n("EP", 4, 130, "REST-Endpoint /search · q · filters · facets · limit · offset", {h:70}),
    n("FB", 4, 220, "Abfrage-Builder · Facetten-Filter · Boolesche Operatoren", {h:64}),
    n("ORCH", 4, 314, "Verbund-Orchestrierung · parallele Abfragen · Gewichtung", {h:64}),
    n("HYB", 4, 408, "Hybrid-Orchestrierung · klassisch + Vektor · Fusion · Re-Ranking", {h:70}),

    // Spalte 5: Frontend
    n("SM", 5, 120, "Suchmaske einfach + erweitert · Autocomplete mit Debounce", {h:64}),
    n("FAC", 5, 204, "Facetten-Sidebar · kaskadierend"),
    n("EL", 5, 280, "Ergebnisliste · Karten · Highlighting · Pagination 10/20/50", {h:64}),
    n("DET", 5, 364, "Detailseite · Zurück zur Suche"),
    n("UZ", 5, 450, "URL-Zustand · q · Filter · Sortierung · Seite · Scroll", {h:64}),
  ];

  const edges = [
    // Quellen → Adapter
    { from: "FRIED",  to: "ADAP", label: "Delta-Abfrage" },
    { from: "INDICO", to: "ADAP", label: "Delta-Abfrage" },
    { from: "MANUELL", to: "ADAP", label: "Delta-Abfrage" },
    { from: "TOBIRA", to: "ADAP", label: "Delta-Abfrage" },
    { from: "OPENCAST", to: "ADAP", label: "Delta-Abfrage" },
    { from: "MOODLE", to: "ADAP", label: "Delta-Abfrage" },
    { from: "VCT", to: "ADAP", label: "Delta-Abfrage" },
    { from: "MARKT", to: "ADAP", label: "Ausbau v2", dashed: true },
    // ETL-intern
    { from: "SCHED", to: "ADAP", label: "startet" },
    { from: "HOOK", to: "ADAP", label: "Ereignis sofort" },
    { from: "ADAP", to: "NORM" },
    { from: "NORM", to: "ANR" },
    // KI-Schleife (Anreicherung ↔ LLM/EMB)
    { from: "ANR", to: "LLM", label: "Titel + Beschreibung" },
    { from: "LLM", to: "ANR", label: "5–10 Schlagwörter", dashed: true },
    { from: "ANR", to: "EMB", label: "Titel + Beschreibung" },
    { from: "EMB", to: "ANR", label: "Vektor", dashed: true },
    { from: "ANR", to: "WR" },
    // Writer → Indizes
    { from: "WR", to: "IE", label: "Upsert + Delete" },
    { from: "WR", to: "IM", label: "Upsert + Delete" },
    { from: "WR", to: "IC", label: "Upsert + Delete" },
    { from: "WR", to: "IS", label: "optional", dashed: true },
    { from: "WR", to: "VDB", label: "Vektoren" },
    // Frontend → API
    { from: "SM", to: "EP", label: "HTTP /search" },
    { from: "EP", to: "FB" },
    { from: "FB", to: "LLM", label: "Ist die Query natursprachlich?" },
    { from: "LLM", to: "FB", label: "Suchstruktur + Filter", dashed: true },
    { from: "FB", to: "ORCH" },
    { from: "FB", to: "HYB", label: "KI-Modus" },
    { from: "HYB", to: "ORCH", label: "Keyword-Teil" },
    { from: "HYB", to: "EMB", label: "Query-Embedding" },
    { from: "EMB", to: "HYB", label: "Query-Vektor", dashed: true },
    { from: "HYB", to: "VDB", label: "k-Nearest-Neighbor" },
    { from: "VDB", to: "HYB", label: "Semantische Treffer", dashed: true },
    { from: "HYB", to: "RER", label: "Top-N Kandidaten" },
    { from: "RER", to: "HYB", label: "Neue Reihenfolge", dashed: true },
    // API → Indizes (Verbund)
    { from: "ORCH", to: "IE", label: "parallele Abfragen" },
    { from: "ORCH", to: "IM", label: "parallele Abfragen" },
    { from: "ORCH", to: "IC", label: "parallele Abfragen" },
    { from: "IE", to: "ORCH", label: "Treffer + Facetten", dashed: true },
    { from: "IM", to: "ORCH", label: "Treffer + Facetten", dashed: true },
    { from: "IC", to: "ORCH", label: "Treffer + Facetten", dashed: true },
    // API → Frontend
    { from: "ORCH", to: "EP" },
    { from: "EP", to: "EL", label: "Ergebnisliste + Facetten + Trefferzahl" },
    { from: "EL", to: "DET", label: "Klick auf Treffer" },
    { from: "EL", to: "UZ", label: "aktualisiert", dashed: true },
    { from: "DET", to: "UZ", label: "Detailzustand", dashed: true },
    { from: "UZ", to: "SM", label: "liest + schreibt", dashed: true },
    { from: "UZ", to: "FAC", label: "liest + schreibt", dashed: true },
    { from: "UZ", to: "EL", label: "stellt Liste wieder her", dashed: true },
    { from: "IS", to: "SM", label: "Autocomplete-Vorschläge", dashed: true },
    { from: "FAC", to: "EP", label: "Filter setzen" },
  ];

  return { title: "Komponentenübersicht", elements: el, edges,
           w: cols[5].x + cols[5].w + 40, h: Math.max(...frameH) + 200 };
})();

/* ════════════════════════════════════════════════════════════════
   6 · UI-Ablauf (Aktivitätsdiagramm) — vertikaler Flow mit Rauten
   ════════════════════════════════════════════════════════════════ */
DIAGRAMS_NATIVE["06-ui-aktivitaet.mmd"] = (() => {
  const CX = 480;          // Mittelachse
  const W = 1340, H = 1900;
  const el = [];
  const e = [];

  const add = (id, type, label, y, opts={}) => {
    const w = opts.w || (type === "diamond" ? 240 : 300);
    const h = opts.h || (type === "diamond" ? 100 : 56);
    el.push({ id, type, label, x: CX - w/2, y, w, h, ...opts });
  };

  add("ST",  "pill", "Suchseite geöffnet", 40, {type:"pill"});
  add("UZL", "shape", "URL-Zustand lesen · q · Filter · Sortierung · Seite · Scroll", 150, {h:64});
  add("D1",  "diamond", "Suchzustand in der URL vorhanden?", 260, {type:"diamond"});
  add("PRE", "shape", "Suchmaske + Facetten + Ergebnisliste vorbesetzen", 420, {h:64});
  add("LEER","shape", "Leeres Suchfeld zeigen", 420, {x: CX + 220, w: 260});
  add("REQ", "shape", "Abfrage an die Search-API senden", 540);
  add("EIN", "shape", "Suchbegriff eingeben · Autocomplete via campus_suggest · Debounce", 640, {h:64});
  add("D2",  "diamond", "Esc gedrückt · Feld geleert?", 760, {type:"diamond"});
  add("UPS", "shape", "URL-Zustand aktualisieren", 920);
  add("ANZ", "shape", "Ergebnisliste anzeigen · Karten mit Quelle + Highlighting · Skeleton-Loading", 1010, {h:70});
  add("D3",  "diamond", "Nächste Aktion?", 1140, {type:"diamond"});
  add("FIR", "shape", "Filter anwenden · kaskadierend · ODER innerhalb · UND über Facetten", 1290, {x: CX - 480, y: 1290, h:70, w:320});
  add("PAG", "shape", "Paginierung ändern · 10/20/50 mit offset", 1290, {x: CX + 60, w: 300});
  add("DET", "shape", "Detailseite öffnen · SPA-Route · SSR-Variante für Crawler", 1290, {x: CX + 480, w: 320, h:70});
  add("UFR", "shape", "URL-Zustand um Filter ergänzen", 1430, {x: CX - 480, w: 320});
  add("UPA", "shape", "URL mit neuem offset aktualisieren", 1430, {x: CX + 60, w: 300});
  add("D4",  "diamond", "Zurück zur Suche oder Browser-Zurück?", 1520, {x: CX + 480, w: 320, h:110});
  add("RES", "shape", "Suchzustand aus der URL rekonstruieren · Filter · Sortierung · Seite · Scroll", 1660, {x: CX + 480, w: 320, h:70});
  add("ENDE","pill", "Ende · Suchzustand bleibt in der URL", 60, {type:"pill", x: CX + 220, w: 280, h: 52});

  // Kanten
  e.push({ from:"ST", to:"UZL" });
  e.push({ from:"UZL", to:"D1" });
  e.push({ from:"D1", to:"PRE", label:"ja" });
  e.push({ from:"D1", to:"LEER", label:"nein" });
  e.push({ from:"PRE", to:"REQ" });
  e.push({ from:"LEER", to:"EIN" });
  e.push({ from:"EIN", to:"D2" });
  e.push({ from:"D2", to:"EIN", label:"ja · Feld geleert", back:true });
  e.push({ from:"D2", to:"UPS", label:"nein · Enter oder Lupe" });
  e.push({ from:"UPS", to:"ANZ" });
  e.push({ from:"ANZ", to:"D3" });
  e.push({ from:"D3", to:"FIR", label:"Filter oder Facette klicken" });
  e.push({ from:"D3", to:"PAG", label:"Seite wechseln" });
  e.push({ from:"D3", to:"DET", label:"Ergebnis klicken" });
  e.push({ from:"D3", to:"ANZ", label:"keine Aktion", back:true });
  e.push({ from:"FIR", to:"UFR" });
  e.push({ from:"UFR", to:"REQ", back:true });
  e.push({ from:"PAG", to:"UPA" });
  e.push({ from:"UPA", to:"REQ", back:true });
  e.push({ from:"DET", to:"D4" });
  e.push({ from:"D4", to:"RES", label:"ja" });
  e.push({ from:"RES", to:"ANZ", back:true });
  e.push({ from:"D4", to:"DET", label:"nein · bleibt", back:true });
  e.push({ from:"ANZ", to:"ENDE", label:"Suche verlassen" });

  return { title: "UI-Ablauf", elements: el, edges: e, w: W, h: H + 100 };
})();
