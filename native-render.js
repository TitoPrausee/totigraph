/* ── Native-Renderer: Board-Elemente statt Mermaid-SVG ──────────
   Rendert DIAGRAMS_NATIVE als echte Board-Objekte:
   - DOM-Elemente für Shapes/DB/Stickies/Frames/Klassen (CSS-Look)
   - Ein SVG-Layer darunter für Connectoren (Manhattan-Routing,
     Pfeilspitzen, Labels mit weißer Chip-Hinterlegung)
   Interaktion (Pan/Zoom/Fit) bleibt unverändert — es entsteht ein
   normales Board-Layout mit nat.w/nat.h. */

const NAT = {
  get K(){ return K; },
};

function el(id, cls, style, html){
  const d = document.createElement("div");
  d.className = cls;
  if (id) d.id = id;
  if (style) Object.assign(d.style, style);
  if (html !== undefined) d.innerHTML = html;
  return d;
}

/* ── Element-Renderer je Typ ───────────────────────────────────── */
function renderNativeElement(e){
  const base = {
    position: "absolute",
    left: e.x + "px", top: e.y + "px",
    width: e.w + "px", height: e.h + "px",
  };

  switch (e.type) {

    case "frame":
      return el("el-" + e.id, "n-frame", base,
        '<div class="n-frame-tab">' + e.label + '</div>');

    case "shape": {
      const dashed = e.dashed ? " dashed" : "";
      return el("el-" + e.id, "n-shape" + dashed, base, e.label);
    }

    case "pill":
      return el("el-" + e.id, "n-pill", base, e.label);

    case "diamond": {
      // Raute via SVG-Polygon, Label zentriert (überlappt intentionally)
      const d = el("el-" + e.id, "n-diamond", base);
      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("width", e.w); svg.setAttribute("height", e.h);
      svg.setAttribute("viewBox", "0 0 " + e.w + " " + e.h);
      svg.style.position = "absolute"; svg.style.inset = "0";
      const p = document.createElementNS("http://www.w3.org/2000/svg","polygon");
      p.setAttribute("points", (e.w/2) + ",1 " + (e.w-1) + "," + (e.h/2) + " " + (e.w/2) + "," + (e.h-1) + " 1," + (e.h/2));
      p.style.fill = "#fff"; p.style.stroke = K.CARD_BORDER; p.style["stroke-width"] = "1";
      svg.appendChild(p);
      d.appendChild(svg);
      const t = el(null, "n-diamond-label", null, e.label);
      d.appendChild(t);
      return d;
    }

    case "db": {
      // Zylinder: Ellipse oben + Körper + unten abgerundete Bogenlinie
      const d = el("el-" + e.id, "n-db" + (e.dashed ? " dashed" : ""), base);
      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("width", e.w); svg.setAttribute("height", e.h);
      svg.setAttribute("viewBox", "0 0 " + e.w + " " + e.h);
      svg.style.position = "absolute"; svg.style.inset = "0";
      const ry = 14;
      const body = document.createElementNS("http://www.w3.org/2000/svg","path");
      body.setAttribute("d",
        "M0," + ry +
        " a" + (e.w/2) + "," + ry + " 0 0 1 " + e.w + ",0" +
        " v" + (e.h - 2*ry) +
        " a" + (e.w/2) + "," + ry + " 0 0 1 -" + e.w + ",0" +
        " z");
      body.style.fill = "#fff"; body.style.stroke = K.CARD_BORDER;
      body.style["stroke-width"] = "1";
      const lid = document.createElementNS("http://www.w3.org/2000/svg","ellipse");
      lid.setAttribute("cx", e.w/2); lid.setAttribute("cy", ry);
      lid.setAttribute("rx", e.w/2); lid.setAttribute("ry", ry);
      lid.style.fill = "rgba(66,98,255,0.10)"; lid.style.stroke = K.CARD_BORDER;
      lid.style["stroke-width"] = "1";
      svg.appendChild(body); svg.appendChild(lid);
      d.appendChild(svg);
      d.appendChild(el(null, "n-db-label", null, e.label));
      return d;
    }

    case "sticky":
      return el("el-" + e.id, "n-sticky", base, e.label);

    case "actor":
      return el("el-" + e.id, "n-actor", base, e.label);

    case "group":
      return el("el-" + e.id, "n-group", base,
        '<div class="n-group-chip">' + e.label + '</div>');

    case "class": {
      const d = el("el-" + e.id, "n-class", base);
      d.appendChild(el(null, "n-class-head", null, e.label));
      const body = el(null, "n-class-body");
      e.fields.forEach(f => body.appendChild(el(null, "n-class-field", null, f)));
      d.appendChild(body);
      return d;
    }
  }
  return el("el-" + e.id, "n-shape", base, e.label || e.id);
}

/* ── Manhattan-Routing ─────────────────────────────────────────── */
function anchor(e, dir){
  // dir: 'r','l','t','b' → Ankerpunkt der Kante an der Elementgrenze
  const cx = e.x + e.w/2, cy = e.y + e.h/2;
  switch(dir){
    case "r": return [e.x + e.w, cy];
    case "l": return [e.x, cy];
    case "t": return [cx, e.y];
    case "b": return [cx, e.y + e.h];
  }
  return [cx, cy];
}

function routeManhattan(a, b, back=false){
  // Orthogonale 3-Segment-Route mit mittlerem vertikalen/horizontalen Segment
  const [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) < 8) return "M" + x1 + "," + y1 + " L" + x2 + "," + y2;
  if (Math.abs(dy) < 8) return "M" + x1 + "," + y1 + " L" + x2 + "," + y2;
  const mx = x1 + dx/2;
  return "M" + x1 + "," + y1 + " L" + mx + "," + y1 + " L" + mx + "," + y2 + " L" + x2 + "," + y2;
}

/* Pfeilspitze als Marker-Def */
const ARROW_DEFS = `
<defs>
  <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#5a5e73"/>
  </marker>
  <marker id="arw-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
    <path d="M1,1 L9,5 L1,9" fill="none" stroke="#5a5e73" stroke-width="1.3"/>
  </marker>
  <marker id="arw-tri" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#4262ff"/>
  </marker>
  <marker id="arw-uml" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
    <path d="M1,1 L11,6 L1,11 z" fill="#ffffff" stroke="#5a5e73" stroke-width="1.2"/>
  </marker>
</defs>`;

/* ── Kanten-Renderer ───────────────────────────────────────────── */
function renderEdges(diagram, byId){
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", diagram.w);
  svg.setAttribute("height", diagram.h);
  svg.setAttribute("viewBox", "0 0 " + diagram.w + " " + diagram.h);
  svg.style.position = "absolute";
  svg.style.left = "0"; svg.style.top = "0";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";
  svg.innerHTML = ARROW_DEFS;

  const labels = [];

  diagram.edges.forEach((ed, idx) => {
    const from = byId[ed.from], to = byId[ed.to];
    if(!from || !to) return;

    // Sequenz: Kante hat feste y (Zeitreihe) + horizontale Route
    if (ed.y !== undefined && diagram.seqCols){
      const colOf = (node) => {
        // byId-Elemente der Sequenz sind Actors (type 'actor'); Index über ID act_N
        const m = /act_(\d+)/.exec(node.id);
        const idx = m ? parseInt(m[1], 10) : -1;
        return diagram.seqCols[idx] ? diagram.seqCols[idx].x : (node.x + node.w/2);
      };
      const fx = colOf(byId[ed.from]);
      const tx = colOf(byId[ed.to]);
      const y = ed.y;
      // Life-Line-Hairlines:
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", fx); line.setAttribute("x2", fx);
      line.setAttribute("y1", TOP_LIFELINE); line.setAttribute("y2", diagram.h - 60);
      line.setAttribute("stroke", "rgba(5,0,56,0.14)");
      line.setAttribute("stroke-dasharray", "5 5");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
      if (Math.abs(tx - fx) > 1){
        // Message-Pfeil
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", "M" + fx + "," + y + " L" + tx + "," + y);
        path.setAttribute("stroke", ed.dashed ? "#9a9aa4" : "#5a5e73");
        path.setAttribute("stroke-width", "1.4");
        if (ed.dashed) path.setAttribute("stroke-dasharray", "6 5");
        path.setAttribute("marker-end", ed.dashed ? "url(#arw-open)" : "url(#arw)");
        path.setAttribute("fill", "none");
        svg.appendChild(path);
      } else {
        // Selbstaufruf: kleiner Loop nach rechts
        const w = 46, h = 30;
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d",
          "M" + fx + "," + (y-8) +
          " C" + (fx+w) + "," + (y-8) + " " + (fx+w) + "," + (y+h) + " " + fx + "," + (y+h));
        path.setAttribute("stroke", "#5a5e73");
        path.setAttribute("stroke-width", "1.4");
        path.setAttribute("fill", "none");
        path.setAttribute("marker-end", "url(#arw)");
        svg.appendChild(path);
      }
      // Nummer-Chip (auch am Selbstanruf-Loop)
      if (ed.num){
        const nx = (Math.abs(tx-fx) > 1) ? (Math.min(fx,tx) - 14) : (fx + 30);
        const numEl = el(null, "n-msg-num", {left: nx + "px", top: (y - 10) + "px"}, ed.num);
        labels.push(numEl);
      }
      // Label-Chip über dem Pfeil
      if (ed.label){
        const lx = (fx + tx)/2, ly = y - 9;
        labels.push(el(null, "n-msg-label", {left: lx + "px", top: ly + "px", transform: "translateX(-50%)"}, ed.label));
      }
      return;
    }

    // Standard: Manhattan zwischen Elementgrenzen
    const fcx = from.x + from.w/2, fcy = from.y + from.h/2;
    const tcx = to.x + to.w/2, tcy = to.y + to.h/2;
    let a, b;
    if (ed.back){
      // Rückkante: unten raus, oben rein
      a = anchor(from, "b"); b = anchor(to, "t");
    } else if (Math.abs(tcx - fcx) > Math.abs(tcy - fcy)){
      a = anchor(from, tcx > fcx ? "r" : "l");
      b = anchor(to, tcx > fcx ? "l" : "r");
    } else {
      a = anchor(from, tcy > fcy ? "b" : "t");
      b = anchor(to, tcy > fcy ? "t" : "b");
    }

    // Vererbung (Klassendiagramm): offene Dreieckspitze
    const isSuper = /vererbt/.test(ed.label || "");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", routeManhattan(a, b, ed.back));
    path.setAttribute("stroke", ed.dashed ? "#9a9aa4" : "#5a5e73");
    path.setAttribute("stroke-width", "1.4");
    path.setAttribute("fill", "none");
    if (ed.dashed) path.setAttribute("stroke-dasharray", "6 5");
    path.setAttribute("marker-end", isSuper ? "url(#arw-uml)" : (ed.dashed ? "url(#arw-open)" : "url(#arw)"));
    svg.appendChild(path);

    // Label-Chip am Routen-Mittelpunkt — bei langen vertikalen Kanten
    // am 35%-Punkt (nah am Start), damit Ziel-Labels nicht kollidieren
    if (ed.label){
      const t = (Math.abs(b[1]-a[1]) > Math.abs(b[0]-a[0]) && Math.abs(b[1]-a[1]) > 200) ? 0.32 : 0.5;
      const midX = a[0] + (b[0]-a[0])*t, midY = a[1] + (b[1]-a[1])*t;
      labels.push(el(null, "n-edge-label",
        {left: midX + "px", top: midY + "px", transform: "translate(-50%,-50%)"},
        ed.label));
    }
  });

  return {svg, labels};
}
let TOP_LIFELINE = 92; // Akteur-Unterkante + gap

/* ── Diagramm in world rendern ─────────────────────────────────── */
function renderNativeDiagram(key){
  const diagram = DIAGRAMS_NATIVE[key];
  if(!diagram) return null;

  TOP_LIFELINE = 40 + 52 + 8;  // Akteur-Top + Höhe + gap

  const byId = {};
  diagram.elements.forEach(e => byId[e.id] = e);

  world.replaceChildren();

  // 1) Kanten-SVG (unterhalb der Elemente im DOM = natürliche Layer-Ordnung)
  const {svg, labels} = renderEdges(diagram, byId);
  world.appendChild(svg);

  // 2) Elemente
  diagram.elements.forEach(e => world.appendChild(renderNativeElement(e)));

  // 3) Kanten-Labels + Nummern als eigene Layer (über allem)
  labels.forEach(l => world.appendChild(l));

  // 4) Klassen-Notizen als Stickies UNTER der Karte (kein Karten-Verdecken)
  diagram.elements.filter(e => e.type === "class" && e.note).forEach(e => {
    const st = el(null, "n-sticky n-class-note",
      {left: e.x + "px", top: (e.y + e.h + 12) + "px",
       width: Math.max(240, e.w) + "px", height: "auto"},
      e.note);
    world.appendChild(st);
    e._stickyH = 76; // für nat.h-Reserve
  });

  nat = { w: diagram.w, h: diagram.h };
  return diagram;
}

/* Sticky-Höhe: auto — fit nutzt trotzdem nat.h (Board-Bounds grob ausreichend) */
