/* ════════════════════════════════════════════════════════════════
   Sequenzdiagramme (02, 03, 04) — als Board-Layout:
   Akteure = weiße Karten oben, Life-Lines = gestrichelte Hairlines,
   Messages = beschriftete Pfeile zwischen Life-Lines (Zeitreihe).
   Selbstanrufe = Loop-Kapsel rechts. alt/par/opt-Blöcke = helle
   Umrahmung mit Titel-Chip. Notes = gelbe Stickies.
   ════════════════════════════════════════════════════════════════ */

/* Sequenz-Helfer: baut Elemente + Kanten aus einer deklarativen Liste */
function seqDiagram({title, actors, steps, noteW=260}) {
  const el = [], edges = [];
  const TOP = 40;          // Akteur-Y
  const CARD_H = 52;
  const firstY = TOP + CARD_H + 60;   // erste Message-Y
  const ROW = 74;          // Zeilenhöhe
  const ACT_W = 170, ACT_GAP = 40;
  const N = actors.length;
  const W = N * ACT_W + (N-1) * ACT_GAP + 120;
  const colX = (i) => 60 + i * (ACT_W + ACT_GAP) + ACT_W/2; // Mitte der Life-Line
  const H = firstY + steps.length * ROW + 160;

  // Akteur-Karten
  actors.forEach((a, i) => {
    el.push({ id: "act_" + i, type: "actor", label: a,
      x: colX(i) - ACT_W/2, y: TOP, w: ACT_W, h: CARD_H });
  });

  // Steps: {from, to, label?, dashed?, note?, self?, group?: {title, rows:[idx...], color?}}
  let msgNum = 0;   // nur echte Messages zählen (Notes/Selfs ohne Chip-Doppelzählung)
  steps.forEach((s, i) => {
    const y = firstY + i * ROW;
    if (s.note) {
      el.push({ id: "note_" + i, type: "sticky", label: s.note,
        x: colX(s.over ?? Math.floor(N/2)) - noteW/2, y: y - 18, w: noteW, h: 64 });
      return;
    }
    msgNum += 1;
    if (s.self) {
      // Selbstanruf: kleiner Loop an der eigenen Life-Line
      edges.push({ from: "act_" + s.from, to: "act_" + s.from,
        label: s.label, self: true, y, num: msgNum });
      return;
    }
    edges.push({ from: "act_" + s.from, to: "act_" + s.to,
      label: s.label, dashed: s.dashed, y, num: msgNum });
  });

  // Gruppenrahmen (alt/par/opt) — als separate Elemente NACH den Steps deklariert
  // {type:'group', title, x1(col), x2(col), y1(row), y2(row), color}
  (steps.groups || []).forEach((g, gi) => {
    const x = colX(Math.min(...g.cols)) - ACT_W/2 - 24;
    const x2 = colX(Math.max(...g.cols)) + ACT_W/2 + 24;
    el.push({ id: "grp_" + gi, type: "group", label: g.kind + " · " + g.title,
      x, y: firstY + g.rows[0]*ROW - 30, w: x2 - x, h: (g.rows[1]-g.rows[0])*ROW + ROW - 10,
      color: g.color || "blue" });
  });

  return { title, elements: el, edges, w: W, h: H, seqCols: actors.map((a,i)=>({label:a, x: colX(i)})) };
}

/* ── 2 · Verbundabfrage ─────────────────────────────────────────── */
DIAGRAMS_NATIVE["02-verbundsuche.mmd"] = seqDiagram({
  title: "Verbundabfrage",
  actors: ["Frontend SPA", "Search-API", "campus_events", "campus_media", "campus_courses"],
  steps: [
    { from: 0, to: 1, label: "GET /search · q, filters, facets, limit, offset" },
    { from: 1, to: 1, label: "Anfrage prüfen · Facetten-Filter aufbauen", self: true },
    { from: 1, to: 2, label: "Keyword-Query mit Filtern + Facetten" },
    { from: 2, to: 1, label: "Trefferliste · Quelle Friedolin, Indico, Redaktion", dashed: true },
    { from: 1, to: 3, label: "Keyword-Query mit Filtern + Facetten" },
    { from: 3, to: 1, label: "Trefferliste · Tobira, Opencast · Transkript-Treffer", dashed: true },
    { from: 1, to: 4, label: "Keyword-Query mit Filtern + Facetten" },
    { from: 4, to: 1, label: "Trefferliste · Moodle, VCT · Semester", dashed: true },
    { from: 1, to: 1, label: "Scores normalisieren · Gesamttreffer fusionieren", self: true },
    { note: "Index-Gewichte: Veranstaltungen 1,0 · Kurse 0,9 · Medien 0,8", over: 2 },
    { from: 1, to: 1, label: "Custom Ranking: published_date · popularity · keyword_match", self: true },
    { from: 1, to: 1, label: "Degradierung · Ergebnisliste aus erreichbaren Indizes", self: true },
    { from: 1, to: 0, label: "Ergebnisliste mit Hinweis auf eingeschränktem Index", dashed: true },
    { from: 1, to: 0, label: "Ergebnisliste · Facetten · Gesamttrefferzahl" },
    { from: 0, to: 0, label: "Karten rendern · Typ-Badge · Quelle · Highlighting · URL-Zustand", self: true },
    { from: 0, to: 1, label: "GET /search · neuer offset oder erweiterte Filter" },
  ],
  noteW: 300,
});

/* ── 3 · KI-gestützte Suche ─────────────────────────────────────── */
DIAGRAMS_NATIVE["03-ki-suche.mmd"] = seqDiagram({
  title: "KI-gestützte Suche",
  actors: ["Frontend SPA", "Search-API", "Kleines LLM", "Embeddings", "Vektorspeicher", "Verbund-Index", "Re-Ranker"],
  steps: [
    { from: 0, to: 1, label: "Frage · „Was kann ich im ersten Semester machen?“" },
    { from: 1, to: 1, label: "Eingabe normalisieren · Umlaute · Kleinschreibung", self: true },
    { from: 1, to: 2, label: "NL-Erkennung · Query, Intent, Entitäten" },
    { from: 2, to: 1, label: "JSON · Query-Kern, Filter, Zielgruppe, Zeitraum", dashed: true },
    { from: 1, to: 5, label: "Keyword-Query mit erkannten Filtern" },
    { from: 5, to: 1, label: "Trefferliste klassisch + Facetten", dashed: true },
    { from: 1, to: 3, label: "Query-Embedding berechnen" },
    { from: 3, to: 1, label: "Query-Vektor", dashed: true },
    { from: 1, to: 4, label: "k-Nearest-Neighbor-Suche im Embedding-Index" },
    { from: 4, to: 1, label: "Semantische Kandidaten mit Distanz", dashed: true },
    { from: 1, to: 1, label: "Fusion per Reciprocal Rank Fusion unter Index-Gewichten", self: true },
    { from: 1, to: 6, label: "Top-N Kandidaten plus Query" },
    { from: 6, to: 1, label: "Sortierte Treffer nach Re-Ranking", dashed: true },
    { from: 1, to: 0, label: "Ergebnisliste markiert als KI-Suche" },
    { from: 1, to: 5, label: "Keyword-Query ohne KI-Filter" },
    { from: 5, to: 1, label: "Trefferliste klassisch", dashed: true },
    { from: 1, to: 0, label: "Ergebnisliste (klassisch)" },
    { note: "Fallback: LLM, Embeddings oder Re-Ranker nicht erreichbar → nur klassische Suche, Hinweis im Ergebnis", over: 3 },
  ],
  noteW: 340,
});

/* ── 4 · ETL-Pipeline ───────────────────────────────────────────── */
DIAGRAMS_NATIVE["04-etl-pipeline.mmd"] = seqDiagram({
  title: "ETL-Pipeline",
  actors: ["Scheduler", "Webhook-Receiver", "ETL-Pipeline", "Quellsysteme", "Kleines LLM", "Embeddings", "Index + Vektor"],
  steps: [
    { note: "Loop: alle 15 Minuten, je Quellsystem · Vollreindexierung nur bei Schemaänderung (v1 §1.3)", over: 2 },
    { from: 0, to: 2, label: "Delta-Lauf starten" },
    { from: 2, to: 3, label: "Änderungen seit last_synced abfragen" },
    { from: 3, to: 2, label: "Geänderte Datensätze als JSON · leere Liste wenn nichts neu", dashed: true },
    { from: 2, to: 2, label: "Normalisierung + Mapping aufs Index-Schema · Deduplizierung", self: true },
    { from: 2, to: 4, label: "KI-Schlagwörter generieren · Titel, Beschreibung, Transkript" },
    { from: 4, to: 2, label: "5 bis 10 Schlagwörter", dashed: true },
    { from: 2, to: 2, label: "Validierung gegen Thesaurus + Synonym-Map", self: true },
    { from: 2, to: 5, label: "Dokument-Embeddings berechnen" },
    { from: 5, to: 2, label: "Vektoren je Dokument", dashed: true },
    { from: 2, to: 6, label: "Upsert der Dokumente" },
    { from: 6, to: 2, label: "Bestätigung", dashed: true },
    { from: 2, to: 2, label: "last_synced je Quelle aktualisieren", self: true },
    { from: 2, to: 6, label: "Delete im Index + Vektorspeicher (abgelaufen, gelöscht)" },
    { note: "Webhook-Weg für Quellen mit Auslöser: sofort statt im Delta-Lauf", over: 1 },
    { from: 3, to: 1, label: "Änderungsmeldung über Webhook" },
    { from: 1, to: 2, label: "Einzelauftrag einreihen" },
    { from: 2, to: 3, label: "Einzeldokument abrufen" },
    { from: 3, to: 2, label: "Dokument", dashed: true },
    { from: 2, to: 5, label: "Vektor für das Einzeldokument" },
    { from: 5, to: 2, label: "Vektor", dashed: true },
    { from: 2, to: 4, label: "KI-Schlagwörter inline generieren" },
    { from: 4, to: 2, label: "Schlagwörter", dashed: true },
    { from: 2, to: 6, label: "Upsert des Einzeldokuments" },
  ],
  noteW: 340,
});

/* ════════════════════════════════════════════════════════════════
   5 · Datenmodell — Klassendiagramm als Board:
   Klassen = weiße Karten mit Titelzeile + Feldliste (Tabelle-Look),
   Vererbung = Pfeile, Notes = gelbe Stickies.
   ════════════════════════════════════════════════════════════════ */
DIAGRAMS_NATIVE["05-datenmodell.mmd"] = (() => {
  const cls = (id, label, fields, x, y, w=300, note) => {
    const el = { id, type: "class", label, fields,
      x, y, w, h: 46 + fields.length * 22 + 10 };
    if (note) el.note = note; // als Sticky neben der Karte gerendert
    return el;
  };

  const el = [
    cls("IDX", "IndexDokument", [
      "id · typ · titel · titel_en",
      "beschreibung · beschreibung_en",
      "url · keywords · keywords_ki",
      "keyword_match · zielgruppen",
      "sprache · published_date",
      "popularity · source_system",
      "source_url · source_label · last_synced",
    ], 620, 40, 340, "keywords aus Quellsystem + Redaktion · keywords_ki vom KI-Dienst"),

    cls("EVT", "EventDokument", [
      "beginn · ende · veranstalter",
      "ort · format · kategorie · geo",
    ], 180, 500, 340, "Index campus_events · Facetten: Zeitraum, Veranstalter, Ort, Format, Schlagwörter, Zielgruppe, Sprache"),

    cls("MED", "MediaDokument", [
      "opencast_id · serientitel",
      "dauer_sekunden · aufnahmedatum",
      "medientyp · transkription",
      "kapitelmarken · lizenz · thumbnail_url",
    ], 620, 500, 340, "Index campus_media · Facetten: Medientyp, Lizenz, Produzent, Schlagwörter, Zielgruppe, Sprache"),

    cls("KUR", "Kursdokument", [
      "semester · veranstaltungsart",
      "modulzuordnung · studiengang",
    ], 1060, 500, 340, "Index campus_courses · Facetten: Semester, Zielgruppe, Schlagwörter, Sprache"),

    cls("SUG", "Suggestdokument", [
      "suchbegriff · quelle · gewicht",
    ], 180, 920, 340, "Index campus_suggest · Quellen: Top-Schlagwörter, Suchhistorie, Index-Titel"),

    cls("VEC", "Vektoreintrag", [
      "doc_id · modell · dimension",
      "vektor (number[])",
    ], 1060, 920, 340, "Modell bge-m3 · 1024 Dimensionen · Anreicherung über ETL · Vektorspeicher, Ausbau v2"),
  ];

  const edges = [
    { from: "IDX", to: "EVT", label: "vererbt an · Index campus_events" },
    { from: "IDX", to: "MED", label: "vererbt an · Index campus_media" },
    { from: "IDX", to: "KUR", label: "vererbt an · Index campus_courses" },
    { from: "IDX", to: "SUG", label: "vererbt an · Index campus_suggest" },
    { from: "IDX", to: "VEC", label: "1 : 1 · Embedding im Vektorspeicher" },
  ];

  return { title: "Datenmodell", elements: el, edges, w: 1560, h: 1240 };
})();
