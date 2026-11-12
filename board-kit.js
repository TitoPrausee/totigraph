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

function dataOf(id){ return currentDiagram().elements.find(e => e.id === id); }
function currentDiagram(){ return DIAGRAMS_NATIVE[META[cur].file]; }

/* Undo-Einträge: {kind:'move', id, ox, oy, nx, ny} | {kind:'add', el} |
   {kind:'del', el} | {kind:'edge', edge} */
function pushUndo(u){ undoStack.push(u); if (undoStack.length > 100) undoStack.shift(); }

function doUndo(){
  const u = undoStack.pop();
  if(!u) return;
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
  }
  clearSel();
  redrawEdges();
  apply();
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

/* ── Element-Drag (pointerdown auf Element) ───────────────────── */
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
  if(dragEl.moved) pushUndo({kind:"move", id:dragEl.id, ox:dragEl.ox, oy:dragEl.oy, nx:dataOf(dragEl.id).x, ny:dataOf(dragEl.id).y});
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
  return e;
}

function removeElement(id, fromUndo=false){
  const d = currentDiagram();
  if(!d) return;
  const idx = d.elements.findIndex(e => e.id === id);
  if(idx < 0) return;
  const [e] = d.elements.splice(idx, 1);
  // Angrenzende Kanten mitentfernen — Undo-Stack: Element-Undo LAST,
  // damit ein einzelnes Cmd+Z beides zurückholt (Edges zuerst restaurieren)
  const dropEdges = d.edges.filter(ed => ed.from === id || ed.to === id);
  d.edges = d.edges.filter(ed => !(ed.from === id || ed.to === id));
  dropEdges.forEach(ed => pushUndo({kind:"edge", edge: ed}));
  const node = document.getElementById("el-" + id);
  if(node) node.remove();
  pushUndo({kind:"del", el: JSON.parse(JSON.stringify(e)), idx});
  drawMinimap();
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
  // Connect-Werkzeug + Löschen
  const c = document.createElement("button");
  c.className = "picon pal";
  c.id = "t-connect";
  c.title = "Verbinden: A anklicken, dann B (Esc bricht ab)";
  c.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 13 7 9M6 3h7v7M13 3 8.5 7.5"/></svg>';
  c.addEventListener("click", ()=>{ selectTool("t-connect"); c.classList.add("active"); });
  bar.appendChild(c);
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
  }, true);
  ["pointerup","pointercancel"].forEach(t=>
    board.addEventListener(t, ()=>onElPointerUp(), true));
}

/* CSS-Injector für Auswahl-Rahmen + Ghost (append zum <style>) */
const PAL_CSS = `
.n-shape,.n-pill,.n-sticky,.n-db,.n-diamond,.n-actor,.n-class,.n-frame,.n-group{cursor:grab}
.n-shape.sel,.n-pill.sel,.n-sticky.sel,.n-db.sel,.n-diamond.sel,.n-actor.sel,.n-class.sel,.n-frame.sel,.n-group.sel{
  outline:2px solid var(--blue);outline-offset:2px;cursor:grabbing}
.conn-src{outline:2px dashed var(--blue);outline-offset:2px}
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

/* ── Init ─────────────────────────────────────────────────────── */
wireBoard();
buildPalette();
