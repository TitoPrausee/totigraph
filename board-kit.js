/* ── Baukasten: Element-Drag, Auswahl, Palette, Connect, Undo ──
   Elemente sind echte Board-Objekte:
   - Drag am Element verschiebt es (Kanten routen live neu)
   - Klick wählt aus (blauer Rahmen), Entf löscht
   - Palette in der Creation-Bar: Klick = zentriert einfügen,
     Drag aus Palette = an Drop-Position einfügen
   - Connect-Werkzeug: A anklicken → B anklicken = Kante
   - Cmd+Z = Undo (Verschieben, Einfügen, Löschen, Verbinden) */

const PALETTE_TYPES = [
  { type: "shape",   label: "Karte",     hint: "Text-Karte" },
  { type: "db",      label: "Daten",     hint: "DB-Zylinder" },
  { type: "sticky",  label: "Notiz",     hint: "Gelbe Notiz" },
  { type: "pill",    label: "Pill",      hint: "Start/Ende" },
  { type: "diamond", label: "Entscheidung", hint: "Raute" },
  { type: "frame",   label: "Frame",     hint: "Gruppierung" },
];

let dragEl = null;        // {node, id, dx, dy, ox, oy, moved}
let selectedEl = null;    // DOM-Node
let selId = null;         // Element-ID im Data-Model
let connectFrom = null;   // ID im Connect-Modus
let undoStack = [];
let elSeq = 1;

function boardPoint(ev){
  const r = board.getBoundingClientRect();
  return [(ev.clientX - r.left - S.x)/S.z, (ev.clientY - r.top - S.y)/S.z];
}

/* ── Autosave (localStorage, pro Board) ───────────────────────── */
const SAVE_KEY = "totigraph.board.v1";
let saveTimer = null;
function saveBoard(){
  try{
    const snap = {};
    Object.keys(DIAGRAMS_NATIVE).forEach(k => {
      snap[k] = {
        elements: DIAGRAMS_NATIVE[k].elements,
        edges: DIAGRAMS_NATIVE[k].edges,
      };
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
  }catch(err){ /* Private mode / quota — still leise */ }
}
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveBoard, 400);
}
function loadBoard(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const snap = JSON.parse(raw);
    let used = false;
    Object.keys(snap).forEach(k => {
      if(!DIAGRAMS_NATIVE[k]) return;
      DIAGRAMS_NATIVE[k].elements = snap[k].elements;
      DIAGRAMS_NATIVE[k].edges = snap[k].edges;
      used = true;
    });
    return used;
  }catch(err){ return false; }
}
function resetBoard(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(err){}
  location.reload();
}

function dataOf(id){ return currentDiagram().elements.find(e => e.id === id); }
function currentDiagram(){ return DIAGRAMS_NATIVE[META[cur].file]; }

/* Undo-Einträge: {kind:'batch', steps:[...]} — Delete ist ein Batch
   (Element + angrenzende Kanten), ein Cmd+Z holt beides zurück. */
function pushUndo(u){ undoStack.push(u); if (undoStack.length > 100) undoStack.shift(); }

function doUndo(){
  const u = undoStack.pop();
  if(!u) return;
  const undoOne = (u) => {
    if(u.kind === "move"){
      const d = dataOf(u.id);
      if(d){ d.x = u.ox; d.y = u.oy; placeEl(u.id, d); }
    } else if(u.kind === "add"){
      removeElement(u.el.id, true);
    } else if(u.kind === "del"){
      restoreElement(u.el, u.idx, true);
    } else if(u.kind === "edge"){
      // Kante zurück in das Diagramm (Undo nach removeEdge/add)
      const d = currentDiagram();
      if(d && !d.edges.includes(u.edge)){ d.edges.push(u.edge); }
    } else if(u.kind === "reedge"){
      // Endpoint-Rewiring zurücksetzen
      const d = currentDiagram();
      const ed = d.edges.find(e => e === u.edge);
      if(ed){ ed[u.prop] = u.oldId; }
    }
  };
  if(u.kind === "batch") u.steps.forEach(undoOne);
  else undoOne(u);
  clearSel();
  redrawEdges();
  apply();
  scheduleSave();
}

/* ── Auswahl ───────────────────────────────────────────────────── */
function clearSel(){
  if(selectedEl) selectedEl.classList.remove("sel");
  selectedEl = null; selId = null; connectFrom = null;
}
function selectEl(node){
  clearSel();
  selectedEl = node;
  node.classList.add("sel");
  selId = node.id.replace(/^el-/, "");
}

/* ── DOM ↔ Data Sync ───────────────────────────────────────────── */
function placeEl(id, d){
  const node = document.getElementById("el-" + id);
  if(!node || !d) return;
  node.style.left = d.x + "px"; node.style.top = d.y + "px";
}

function redrawEdges(){
  const d = currentDiagram();
  if(!d) return;
  const byId = {};
  d.elements.forEach(e => byId[e.id] = e);
  // Nur SVG + Labels ersetzen, Elemente bleiben (State-preserving)
  const old = world.querySelector(":scope > svg");
  const labelNodes = [...world.children].filter(c => c.classList.contains("n-edge-label") || c.classList.contains("n-msg-num") || c.classList.contains("n-msg-label") || c.classList.contains("n-msg-label"));
  labelNodes.forEach(n => n.remove());
  if(old) old.remove();
  const {svg, labels} = renderEdges(d, byId);
  world.insertBefore(svg, world.firstChild);
  labels.reverse().forEach(l => world.insertBefore(l, world.firstChild));
}

/* ── Edge-Endpoint-Drag: Anker greifen, ziehen, snap-pingen ───── */
let edgeDrag = null; // {edge, end:'from'|'to', wx, wy, pingId}

function edgeEndpoint(edge, end){
  const d = currentDiagram();
  const from = d.elements.find(e => e.id === edge.from);
  const to = d.elements.find(e => e.id === edge.to);
  if(!from || !to) return null;
  if(edge.y !== undefined && d.seqCols){  // Sequenz-Kanten: y fix
    const fx = from.x + from.w/2, tx = to.x + to.w/2;
    return (end === "from") ? [fx, edge.y] : [tx, edge.y];
  }
  const fcx = from.x + from.w/2, fcy = from.y + from.h/2;
  const tcx = to.x + to.w/2, tcy = to.y + to.h/2;
  let a, b;
  if(edge.back){ a = [fcx, from.y + from.h]; b = [tcx, to.y]; }
  else if(Math.abs(tcx-fcx) > Math.abs(tcy-fcy)){
    a = [fcx > tcx ? from.x : from.x + from.w, fcy];
    b = [tcx > fcx ? to.x : to.x + to.w, tcy];
  } else {
    a = [fcx, fcy > tcy ? from.y : from.y + from.h];
    b = [tcx, tcy > fcy ? to.y : to.y + to.h];
  }
  return (end === "from") ? a : b;
}

function hitEndpoint([wx, wy]){
  const d = currentDiagram();
  if(!d) return null;
  for(let i = d.edges.length - 1; i >= 0; i--){
    const ed = d.edges[i];
    for(const end of ["from","to"]){
      const p = edgeEndpoint(ed, end);
      if(p && Math.hypot(p[0]-wx, p[1]-wy) < 14/S.z){
        return {edge: ed, end};
      }
    }
  }
  return null;
}

function snapTarget([wx, wy], excludeId){
  const d = currentDiagram();
  if(!d) return null;
  let best = null, bestDist = 120/S.z;
  d.elements.forEach(e => {
    if(e.id === excludeId || e.type === "frame") return;
    const cx = e.x + e.w/2, cy = e.y + e.h/2;
    const dist = Math.max(
      Math.abs(wx - cx) - e.w/2,
      Math.abs(wy - cy) - e.h/2,
      0);
    if(dist < bestDist){ bestDist = dist; best = e; }
  });
  return best;
}

function pingEl(id, on){
  const node = document.getElementById("el-" + id);
  if(node) node.classList.toggle("ping", !!on);
}

function onEdgeDragMove(ev){
  const [wx, wy] = boardPoint(ev);
  edgeDrag.wx = wx; edgeDrag.wy = wy;
  const d = currentDiagram();
  const target = snapTarget([wx, wy], edgeDrag.end === "from" ? edgeDrag.edge.to : edgeDrag.edge.from);
  // Live-Route: Endpunkt folgt dem Cursor (oder dem Snap-Ziel)
  const ghostPt = target ? edgeEndpoint(target, target.x + target.w/2 < wx ? "x" : "x") : null;
  // Temporäre Endpoint-Position im Data-Model simulieren:
  const ed = edgeDrag.edge;
  const otherId = (edgeDrag.end === "from") ? ed.to : ed.from;
  const other = d.elements.find(e => e.id === otherId);
  // Route zeichnen: Cursor ↔ anderer Endpunkt, direkt routed
  const svg = world.querySelector(":scope > svg");
  if(svg){
    const ax = wx, ay = wy;
    const bx = other.x + other.w/2, by = other.y + other.h/2;
    let a, b;
    if(Math.abs(bx-ax) > Math.abs(by-ay)){
      a = [ax, ay]; b = [bx > ax ? other.x : other.x + other.w, by];
    } else {
      a = [ax, ay]; b = [bx, by > ay ? other.y : other.y + other.h];
    }
    // Ghost-Overlay-Pfad (oberhalb der echten Route)
    let ghostPath = document.getElementById("edge-ghost");
    if(!ghostPath){
      ghostPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      ghostPath.id = "edge-ghost";
      ghostPath.setAttribute("stroke", "var(--blue)");
      ghostPath.setAttribute("stroke-width", "1.6");
      ghostPath.setAttribute("fill", "none");
      ghostPath.setAttribute("stroke-dasharray", "5 4");
      svg.appendChild(ghostPath);
    }
    ghostPath.setAttribute("d", routeManhattan(a, b));
    ghostPath.style.display = "block";
  }
  // Snap-Ping
  if(target && edgeDrag.pingId !== target.id){
    if(edgeDrag.pingId) pingEl(edgeDrag.pingId, false);
    pingEl(target.id, true);
    edgeDrag.pingId = target.id;
  } else if(!target && edgeDrag.pingId){
    pingEl(edgeDrag.pingId, false);
    edgeDrag.pingId = null;
  }
  // Cursor-Kontext: angedocktes Element merken
  edgeDrag.target = target;
}

function onEdgeDragUp(){
  if(!edgeDrag) return;
  const ed = edgeDrag.edge;
  const d = currentDiagram();
  const newTargetId = edgeDrag.target ? edgeDrag.target.id : null;
  const oldId = (edgeDrag.end === "from") ? ed.from : ed.to;
  const ghost = document.getElementById("edge-ghost");
  if(ghost) ghost.remove();
  if(edgeDrag.pingId) pingEl(edgeDrag.pingId, false);
  if(newTargetId && newTargetId !== oldId){
    if(edgeDrag.end === "from") ed.from = newTargetId; else ed.to = newTargetId;
    pushUndo({kind:"reedge", edge: ed, prop: edgeDrag.end, oldId, newId: newTargetId});
    scheduleSave();
  }
  edgeDrag = null;
  redrawEdges();
  apply();
}
function onElPointerDown(ev, node){
  ev.stopPropagation();
  const id = node.id.replace(/^el-/, "");
  const d = dataOf(id);
  if(!d) return;
  selectEl(node);
  const [wx, wy] = boardPoint(ev);
  dragEl = {node, id, dx: wx - d.x, dy: wy - d.y, ox: d.x, oy: d.y, moved: false};
  node.setPointerCapture && node.setPointerCapture(ev.pointerId);
}
function onElPointerMove(ev){
  if(!dragEl) return;
  const [wx, wy] = boardPoint(ev);
  const d = dataOf(dragEl.id);
  if(!d) return;
  const nx = Math.round(wx - dragEl.dx), ny = Math.round(wy - dragEl.dy);
  if(!dragEl.moved && Math.hypot(nx - dragEl.ox, ny - dragEl.oy) < 2) return;
  dragEl.moved = true;
  d.x = nx; d.y = ny;
  placeEl(dragEl.id, d);
  redrawEdges();
  apply();
}
function onElPointerUp(){
  if(!dragEl) return;
  if(dragEl.moved){
    pushUndo({kind:"move", id:dragEl.id, ox:dragEl.ox, oy:dragEl.oy, nx:dataOf(dragEl.id).x, ny:dataOf(dragEl.id).y});
    scheduleSave();
  }
  dragEl = null;
}

/* ── Elemente erzeugen / löschen ──────────────────────────────── */
function newElId(prefix){ return "u" + (elSeq++) + "-" + Math.random().toString(36).slice(2,6); }

function addElement(type, wx, wy, opts={}){
  const d = currentDiagram();
  if(!d) return null;
  const sizes = {
    shape:  {w:200, h:64},  db: {w:170, h:110}, sticky: {w:170, h:110},
    pill:   {w:150, h:44},  diamond: {w:180, h:100}, frame: {w:420, h:300},
    actor:  {w:170, h:48},  class: {w:220, h:120},
  };
  const s = sizes[type] || {w:180, h:64};
  const e = Object.assign({
    id: newElId(), type,
    x: Math.round(wx - s.w/2), y: Math.round(wy - s.h/2),
    w: s.w, h: s.h,
    label: (type === "sticky") ? "Neue Notiz" : (type === "frame") ? "Frame" : "Neues Element",
  }, opts);
  if(type === "class") e.fields = e.fields || ["feld_a", "feld_b"];
  d.elements.push(e);
  const node = renderNativeElement(e);
  world.appendChild(node);
  nat.w = Math.max(nat.w, e.x + e.w + 80);
  nat.h = Math.max(nat.h, e.y + e.h + 80);
  pushUndo({kind:"add", el: JSON.parse(JSON.stringify(e))});
  selectEl(node);
  drawMinimap();
  scheduleSave();
  return e;
}

function removeElement(id, fromUndo=false){
  const d = currentDiagram();
  if(!d) return;
  const idx = d.elements.findIndex(e => e.id === id);
  if(idx < 0) return;
  const [e] = d.elements.splice(idx, 1);
  // Angrenzende Kanten mitentfernen — als EIN Undo-Batch: ein Cmd+Z
  // holt Element + Kanten zusammen zurück (Del-Step zuerst restaurieren)
  const dropEdges = d.edges.filter(ed => ed.from === id || ed.to === id);
  d.edges = d.edges.filter(ed => !(ed.from === id || ed.to === id));
  const node = document.getElementById("el-" + id);
  if(node) node.remove();
  pushUndo({kind:"batch", steps:[
    {kind:"del", el: JSON.parse(JSON.stringify(e)), idx},
    ...dropEdges.map(ed => ({kind:"edge", edge: ed})),
  ]});
  drawMinimap();
  scheduleSave();
}
function restoreElement(e, idx, fromUndo=false){
  const d = currentDiagram();
  if(!d) return;
  d.elements.splice(Math.min(idx, d.elements.length), 0, e);
  const node = renderNativeElement(e);
  world.appendChild(node);
  if(!fromUndo) pushUndo({kind:"add", el: JSON.parse(JSON.stringify(e))});
  drawMinimap();
}

/* ── Kanten verbinden / entfernen ─────────────────────────────── */
function connectEls(fromId, toId){
  const d = currentDiagram();
  if(!d || fromId === toId) return;
  const edge = {from: fromId, to: toId};
  d.edges.push(edge);
  pushUndo({kind:"edge", edge});
  redrawEdges();
  apply();
  scheduleSave();
}
function removeEdge(edge){
  const d = currentDiagram();
  if(!d) return;
  const i = d.edges.indexOf(edge);
  if(i >= 0) d.edges.splice(i, 1);
}

/* ── Palette in der Creation-Bar ──────────────────────────────── */
function buildPalette(){
  const bar = document.querySelector(".cbar");
  if(!bar || document.getElementById("pal-shape")) return;
  const div = document.createElement("span");
  div.className = "vdiv";
  div.style.cssText = "height:1px;width:24px;margin:4px auto";
  bar.appendChild(div);
  PALETTE_TYPES.forEach(t => {
    const b = document.createElement("button");
    b.className = "picon pal";
    b.id = "pal-" + t.type;
    b.title = t.hint + " — klicken zum Einfügen, oder aufs Board ziehen";
    b.innerHTML = paletteIcon(t.type);
    b.dataset.ptype = t.type;
    // Klick: zentriert einfügen
    b.addEventListener("click", ()=>{
      const r = board.getBoundingClientRect();
      const wx = (r.width/2 - S.x)/S.z, wy = (r.height/2 - S.y)/S.z;
      addElement(t.type, wx, wy);
    });
    // Drag: Ghost erzeugen, Drop-Position → addElement
    b.addEventListener("pointerdown", (ev)=>{
      ev.preventDefault();
      const ghost = document.createElement("div");
      ghost.className = "pal-ghost";
      ghost.textContent = t.label;
      document.body.appendChild(ghost);
      const move = (e2)=>{
        ghost.style.left = (e2.clientX + 12) + "px";
        ghost.style.top = (e2.clientY + 12) + "px";
      };
      move(ev);
      const up = (e2)=>{
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        ghost.remove();
        const r = board.getBoundingClientRect();
        const inside = e2.clientX >= r.left && e2.clientX <= r.right && e2.clientY >= r.top && e2.clientY <= r.bottom;
        if(inside){
          const [wx, wy] = boardPoint(e2);
          addElement(t.type, wx, wy);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    bar.appendChild(b);
  });
  // Connect-Werkzeug + Board-Reset
  const c = document.createElement("button");
  c.className = "picon pal";
  c.id = "t-connect";
  c.title = "Verbinden: A anklicken, dann B (Esc bricht ab)";
  c.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 13 7 9M6 3h7v7M13 3 8.5 7.5"/></svg>';
  c.addEventListener("click", ()=>{ selectTool("t-connect"); c.classList.add("active"); });
  bar.appendChild(c);
  // Reset (Board-Zustand im localStorage verwerfen)
  const rs = document.createElement("button");
  rs.className = "picon pal";
  rs.id = "t-reset";
  rs.title = "Board zurücksetzen (gespeicherte Änderungen verwerfen)";
  rs.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9M2.5 8V4.5M2.5 8H6"/></svg>';
  rs.addEventListener("click", ()=>{ if(confirm("Board-Zustand zurücksetzen? Alle Änderungen gehen verloren.")) resetBoard(); });
  bar.appendChild(rs);
}

function paletteIcon(type){
  const sw = (fill, extra="") =>
    '<svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2" fill="' + fill + '" stroke="#6b6e80" ' + extra + '/></svg>';
  switch(type){
    case "shape":   return sw("#ffffff");
    case "db":      return '<svg viewBox="0 0 20 20"><ellipse cx="10" cy="5.5" rx="6.5" ry="2.5" fill="rgba(66,98,255,.15)" stroke="#6b6e80"/><path d="M3.5 5.5v9a6.5 2.5 0 0 0 13 0v-9" fill="#fff" stroke="#6b6e80"/></svg>';
    case "sticky":  return '<svg viewBox="0 0 20 20"><path d="M3 3h14v10l-4 4H3z" fill="#fff180" stroke="#d9b900"/></svg>';
    case "pill":    return '<svg viewBox="0 0 20 20"><rect x="2.5" y="6.5" width="15" height="7" rx="3.5" fill="#fff" stroke="#050038" stroke-width="1.4"/></svg>';
    case "diamond": return '<svg viewBox="0 0 20 20"><polygon points="10,2.5 17.5,10 10,17.5 2.5,10" fill="#fff" stroke="#6b6e80"/></svg>';
    case "frame":   return '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2" fill="rgba(66,98,255,.08)" stroke="rgba(66,98,255,.55)"/></svg>';
  }
  return sw("#fff");
}

/* ── Verkabelung: Board-Pointer-Events mit Element-Drag mischen ── */
function wireBoard(){
  // Elemente fangen pointerdown VOR dem Board-Pan (Capture-Phase)
  board.addEventListener("pointerdown", (ev)=>{
    // 1) Edge-Endpoint-Greif-Zone (Vorrang vor Element-Drag)
    const [wx, wy] = boardPoint(ev);
    const ep = hitEndpoint([wx, wy]);
    if(ep && !document.getElementById("t-hand").classList.contains("active")){
      ev.stopPropagation();
      edgeDrag = {edge: ep.edge, end: ep.end, pingId: null, target: null};
      return;
    }
    const elNode = ev.target.closest(".n-shape,.n-pill,.n-sticky,.n-db,.n-diamond,.n-actor,.n-class,.n-frame,.n-group");
    if(!elNode) { clearSel(); return; }
    if(ev.button !== 0) return;
    // Hand-Tool aktiv → kein Element-Drag
    if(document.getElementById("t-hand").classList.contains("active")) return;
    // Connect-Modus?
    const conn = document.getElementById("t-connect");
    if(conn && conn.classList.contains("active")){
      ev.stopPropagation();
      const id = elNode.id.replace(/^el-/, "");
      if(!connectFrom){ connectFrom = id; elNode.classList.add("conn-src"); }
      else { connectEls(connectFrom, id); connectFrom = null;
        board.querySelectorAll(".conn-src").forEach(n=>n.classList.remove("conn-src")); }
      return;
    }
    onElPointerDown(ev, elNode);
  }, true); // Capture-Phase: läuft vor dem Pan-Handler

  board.addEventListener("pointermove", (ev)=>{
    if(dragEl) onElPointerMove(ev);
    else if(edgeDrag) onEdgeDragMove(ev);
  }, true);
  ["pointerup","pointercancel"].forEach(t=>
    board.addEventListener(t, ()=>{
      onElPointerUp();
      onEdgeDragUp();
    }, true));
}

/* CSS-Injector für Auswahl-Rahmen + Ghost (append zum <style>) */
const PAL_CSS = `
.n-shape,.n-pill,.n-sticky,.n-db,.n-diamond,.n-actor,.n-class,.n-frame,.n-group{cursor:grab}
.n-shape.sel,.n-pill.sel,.n-sticky.sel,.n-db.sel,.n-diamond.sel,.n-actor.sel,.n-class.sel,.n-frame.sel,.n-group.sel{
  outline:2px solid var(--blue);outline-offset:2px;cursor:grabbing}
.conn-src{outline:2px dashed var(--blue);outline-offset:2px}
.ping{outline:3px solid var(--blue)!important;outline-offset:3px;
  box-shadow:0 0 0 6px rgba(66,98,255,.18)!important}
.ep-cursor{cursor:crosshair}
.pal-ghost{position:fixed;z-index:99;pointer-events:none;background:#fff;
  border:1px solid var(--blue);color:var(--blue);font-size:11px;font-weight:600;
  padding:4px 10px;border-radius:999px;box-shadow:var(--shadow-lg)}
.cbar .picon.pal svg{width:22px;height:22px}`;
const palStyle = document.createElement("style");
palStyle.textContent = PAL_CSS;
document.head.appendChild(palStyle);

/* Undo-Key (Cmd/Ctrl+Z) in bestehenden Key-Handler einhängen */
document.addEventListener("keydown", (e)=>{
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z"){
    e.preventDefault(); doUndo(); return;
  }
  if(e.key === "Delete" || e.key === "Backspace"){
    if(selId){ e.preventDefault();
      const node = document.getElementById("el-" + selId);
      const id = selId; clearSel(); removeElement(id);
    }
    return;
  }
  if(e.key === "Escape" && connectFrom){
    connectFrom = null;
    board.querySelectorAll(".conn-src").forEach(n=>n.classList.remove("conn-src"));
  }
});

/* ── Hover-Tooltip: Was ist dieses Element? ───────────────────── */
const EL_INFO = {
  shape:   {name: "Karte",       desc: "Rechteckiges Text-Element für Bausteine und Schritte"},
  db:      {name: "Datenquelle", desc: "Zylinder für Ablage, Index oder Datenbank"},
  sticky:  {name: "Notiz",       desc: "Gelbes Sticky für Kommentare und Nebeninfos"},
  pill:    {name: "Start/Ende",  desc: "Runde Pille für Start- und Endpunkte eines Ablaufs"},
  diamond: {name: "Entscheidung",desc: "Raute für Verzweigungen — ja/nein, weiter/abbrechen"},
  frame:   {name: "Frame",       desc: "Container, der verwandte Elemente gruppiert"},
  actor:   {name: "Akteur",      desc: "Beteiligtes System oder Rolle im Ablauf"},
  class:   {name: "Klasse",      desc: "Tabellarisches Datenmodell mit Feldliste"},
  group:   {name: "Gruppe",      desc: "Logische Zusammenfassung mehrerer Elemente"},
};
let tipEl = null, tipTimer = null;

function ensureTip(){
  if(tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.id = "el-tip";
  document.body.appendChild(tipEl);
  return tipEl;
}
function showTip(node){
  const id = node.id.replace(/^el-/, "");
  const d = currentDiagram();
  const data = d ? d.elements.find(e => e.id === id) : null;
  if(!data) return;
  const info = EL_INFO[data.type] || {name: "Element", desc: "Board-Element"};
  const t = ensureTip();
  t.innerHTML = '<span class="tip-name">' + info.name + '</span>' +
    '<span class="tip-desc">' + info.desc + '</span>' +
    (data.label ? '<span class="tip-label">' + String(data.label).slice(0, 60) + '</span>' : "");
  t.style.display = "block";
  const r = node.getBoundingClientRect();
  t.style.left = Math.round(r.left + r.width/2) + "px";
  t.style.top = Math.round(r.top - 8) + "px";
}
function hideTip(){
  clearTimeout(tipTimer);
  tipTimer = null;
  if(tipEl) tipEl.style.display = "none";
}
function wireTooltips(){
  world.addEventListener("pointerover", (ev)=>{
    if(dragEl || edgeDrag) return;
    const n = ev.target.closest && ev.target.closest("[id^=el-]");
    if(!n || n.id === "el-tip") return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(()=>showTip(n), 350);
  });
  world.addEventListener("pointerout", (ev)=>{
    const n = ev.target.closest && ev.target.closest("[id^=el-]");
    if(n){ hideTip(); }
  });
  board.addEventListener("pointerdown", hideTip, true);
  // Beim Scrollen/Zoomen mitziehen statt stehen lassen
  board.addEventListener("wheel", hideTip, {passive:false});
}

/* CSS für den Tooltip */
const TIP_CSS = `
#el-tip{position:fixed;z-index:120;transform:translate(-50%,-100%);
  display:none;pointer-events:none;background:rgba(5,0,56,.92);color:#fff;
  border-radius:8px;padding:8px 12px;max-width:280px;
  box-shadow:0 4px 14px rgba(5,0,56,.25)}
#el-tip .tip-name{display:block;font-size:12px;font-weight:700;letter-spacing:.01em}
#el-tip .tip-desc{display:block;font-size:11px;opacity:.75;margin-top:2px;line-height:1.35}
#el-tip .tip-label{display:block;font-size:10.5px;opacity:.55;margin-top:4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:256px}
#el-tip::after{content:"";position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);
  border-left:5px solid transparent;border-right:5px solid transparent;
  border-top:5px solid rgba(5,0,56,.92)}`;
const tipStyle = document.createElement("style");
tipStyle.textContent = TIP_CSS;
document.head.appendChild(tipStyle);

/* ── Init ─────────────────────────────────────────────────────── */
loadBoard();   // gespeicherten Zustand vor dem ersten show() wiederherstellen
wireBoard();
wireTooltips();
buildPalette();
