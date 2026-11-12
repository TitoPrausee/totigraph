/* ── Touchpad / Magic-Mouse-Gestures ──────────────────────────
   macOS-Konventionen wie von einem Board-Tool gewohnt:
   - 2-Finger-Scroll (Trackpad) / 1-Finger-Surf (Magic Mouse):
       → Pan, achsenrichtig, mit Momentum-Glättung
   - Pinch (Trackpad) / Ctrl+Scroll (beide) / Cmd+Scroll:
       → Zoom am Cursor
   - Doppel-Zoom-Geste hintereinander (Smart Zoom): 100 % am Punkt
   - Rechtsklick (2-Finger-Klick) → Board-Menü: Duplizieren,
     Verbinden, Löschen, Einpassen
   Recognition: Pointer-Events für Touch, Wheel-Events für Scroll.
   Ein "Gesture-Hub" filtert Momentum-Bursts und entscheidet
   Pan vs Zoom pro Geste, nicht pro Event. */

(function(){
"use strict";

/* ── Wheel-Klassifizierer ─────────────────────────────────────── */
let wheelMode = null;        // 'pan' | 'zoom' | null (bis Pause)
let wheelPauseT = null;      // Zeitstempel letzter Wheel-Event
let wheelZoomAcc = 0;        // Akkumulator für Ctrl-Signale
const WHEEL_IDLE_MS = 120;   // Geste endet nach 120 ms Funkstille

function classifyWheel(e){
  const now = performance.now();
  const idle = (now - wheelPauseT) > WHEEL_IDLE_MS;
  wheelPauseT = now;
  // Neue Geste? → Modus aus diesem Event ableiten
  if(idle || !wheelMode){
    wheelMode = (e.ctrlKey || e.metaKey) ? "zoom" : "pan";
    wheelZoomAcc = 0;
  } else {
    // Ctrl während laufender Pan-Geste gedrückt → zu Zoom wechseln
    if((e.ctrlKey || e.metaKey) && wheelMode === "pan"){
      wheelMode = "zoom";
      wheelZoomAcc = 0;
    }
  }
  return wheelMode;
}

/* ── Momentum-Dämpfung: erste Wheel-Events eines Bursts dämpfen ── */
let burstCount = 0;
function dampen(e){
  // Chrome feuert bei Trackpad-Bursts große Anfangsdeltas; wir dämpfen
  // den ersten Event eines Bursts (glatter Einstieg, kein Sprung)
  const now = performance.now();
  if(now - wheelPauseT > WHEEL_IDLE_MS) burstCount = 0;
  burstCount++;
  return burstCount === 1 ? 0.6 : 1.0;
}

/* ── Pan-Richtung: Mac-Naturrichtung (Inhalt folgt Fingern) ──── */
function applyPan(e, damp){
  const dy = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
  const dx = e.deltaMode === 1 ? e.deltaX * 24 : e.deltaX;
  const k = 1.15 * damp;
  S.x -= dx * k;
  S.y -= dy * k;
  apply();
  hideHint();
}

/* ── Zoom am Cursor ──────────────────────────────────────────── */
function applyZoom(e, damp){
  const r = board.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const dy = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
  const dx = e.deltaMode === 1 ? e.deltaX * 24 : e.deltaX;
  const f = Math.exp(-(dy + dx) * .0016 * damp);
  zoomAt(mx, my, f);
  hideHint();
  return f;
}

/* ── Smart Zoom: zwei SEPARATE Zoom-Gesten < 450 ms auseinander ──
   Eine Geste endet mit WHEEL_IDLE_MS Funkstille — erst dann zählt
   sie als abgeschlossen. Kontinuierliches Scrollen armet nie. */
let smartZoomArm = 0;        // Ende der letzten abgeschlossenen Zoom-Geste
let gestureEndT = null;      // Timer für Geste-Ende (Arming nach Idle)
function maybeSmartZoom(e, gestureStartedNew){
  const now = performance.now();
  if(smartZoomArm && now - smartZoomArm < 450 && gestureStartedNew){
    // Doppel-Geste: Zoom-Stufe an Cursor auf 100 %
    const r = board.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = (mx - S.x)/S.z, wy = (my - S.y)/S.z;
    S.z = 1;
    S.x = mx - wx; S.y = my - wy;
    animate(); apply(); hideHint();
    smartZoomArm = 0;
    return true;
  }
  return false;
}

/* ── Wheel-Handler (ersetzt den simplen im Template) ─────────── */
board.addEventListener("wheel", (e)=>{
  e.preventDefault();
  const now = performance.now();
  const wasIdle = (now - wheelPauseT) > WHEEL_IDLE_MS;
  const mode = classifyWheel(e);
  const damp = dampen(e);
  if(mode === "zoom"){
    if(maybeSmartZoom(e, wasIdle)){ return; }  // Doppel-Geste → Smart Zoom
    applyZoom(e, damp);
  } else {
    applyPan(e, damp);
  }
  // Geste-Ende-Boundary: nach Funkstille armen (für Smart-Zoom-Doppel)
  clearTimeout(gestureEndT);
  if(mode === "zoom"){
    gestureEndT = setTimeout(()=>{ smartZoomArm = performance.now(); }, WHEEL_IDLE_MS + 30);
  } else {
    smartZoomArm = 0;   // Pan unterbricht die Doppel-Geste-Sequenz
  }
}, {passive:false});

/* ── Rechtsklick-Menü (Board-Konvention) ─────────────────────── */
const ctx = document.createElement("div");
ctx.id = "board-ctx";
ctx.style.cssText = "position:fixed;z-index:130;display:none;background:#fff;" +
  "border-radius:8px;box-shadow:0 4px 14px rgba(5,0,56,.15);padding:4px;min-width:180px";
document.body.appendChild(ctx);
function ctxItem(label, fn, danger){
  const it = document.createElement("button");
  it.textContent = label;
  it.style.cssText = "display:block;width:100%;text-align:left;padding:7px 12px;" +
    "border-radius:6px;font-size:13px;color:#050038;border:none;background:none;cursor:pointer" +
    (danger ? ";color:#c93400" : "");
  it.addEventListener("mouseenter", ()=>it.style.background = "rgba(66,98,255,.08)");
  it.addEventListener("mouseleave", ()=>it.style.background = "none");
  it.addEventListener("click", ()=>{ hideCtx(); fn(); });
  ctx.appendChild(it);
  return it;
}
function hideCtx(){ ctx.style.display = "none"; }
window.addEventListener("pointerdown", (e)=>{ if(!ctx.contains(e.target)) hideCtx(); }, true);

/* 2-Finger-Klick = contextmenu auf macOS; wir fangen es auf dem Board */
board.addEventListener("contextmenu", (e)=>{
  e.preventDefault();
  ctx.innerHTML = "";
  const elNode = e.target.closest && e.target.closest("[id^=el-]");
  const id = elNode ? elNode.id.replace(/^el-/, "") : null;
  if(id && dataOf(id)){
    selectEl(elNode);
    ctxItem("Duplizieren", ()=>{
      const d = dataOf(id);
      if(d) addElement(d.type, d.x + d.w + 24, d.y, Object.assign({}, d, {id: undefined, x: d.x + d.w + 24}));
    });
    ctxItem("Verbinden von hier …", ()=>{
      const conn = document.getElementById("t-connect");
      if(conn){ conn.click(); connectFrom = id; elNode.classList.add("conn-src"); }
    });
    ctxItem("Löschen", ()=>{ const i = id; clearSel(); removeElement(i); }, true);
    ctx.appendChild(document.createElement("hr"));
    ctx.lastChild.style.cssText = "border:none;border-top:1px solid #eee;margin:3px 8px";
  }
  ctxItem("Einpassen (0)", ()=>fit(true));
  ctxItem("Zoom 100 %", ()=>{ const r = board.getBoundingClientRect(); zoomAt(r.width/2, r.height/2, 1/S.z, true); });
  ctx.style.left = e.clientX + "px";
  ctx.style.top = e.clientY + "px";
  ctx.style.display = "block";
});

/* ── Touch-Gestures: 2-Finger-Tap = Smart-Zoom, 3-Finger = Pan ── */
let touchPan = null, touchPinch = null, twoTapT = 0;

board.addEventListener("touchstart", (e)=>{
  if(e.pointerType === "mouse") return;
}, {passive:true});

board.addEventListener("pointerdown", (e)=>{
  if(e.pointerType === "mouse") return;
  try{ board.setPointerCapture(e.pointerId); }catch(err){}
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  world.classList.remove("anim");
  if(ptrs.size === 2){
    const p = [...ptrs.values()];
    const d = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    touchPan = null;
    touchPinch = {d, cx:(p[0].x+p[1].x)/2, cy:(p[0].y+p[1].y)/2};
  } else if(ptrs.size === 1){
    touchPan = {x:e.clientX, y:e.clientY, sx:S.x, sy:S.y, t: performance.now()};
  }
});

board.addEventListener("pointermove", (e)=>{
  if(e.pointerType === "mouse") return;
  if(!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(ptrs.size === 2 && touchPinch){
    const p = [...ptrs.values()];
    const d = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    const cx = (p[0].x+p[1].x)/2, cy = (p[0].y+p[1].y)/2;
    if(touchPinch.d > 0 && d > 0){
      const r = board.getBoundingClientRect();
      zoomAt(cx - r.left, cy - r.top, d/touchPinch.d);
    }
    // Zweifinger-Pan mit pinch-zoom kombinieren (Mitte bewegt sich)
    const dx = cx - touchPinch.cx, dy = cy - touchPinch.cy;
    if(Math.abs(dx) > 2 || Math.abs(dy) > 2){
      S.x += dx; S.y += dy;
      apply();
    }
    touchPinch.d = d;
    touchPinch.cx = cx; touchPinch.cy = cy;
  } else if(ptrs.size === 1 && touchPan){
    S.x = touchPan.sx + (e.clientX - touchPan.x);
    S.y = touchPan.sy + (e.clientY - touchPan.y);
    apply();
  }
});

board.addEventListener("pointerup", (e)=>{
  if(e.pointerType === "mouse") return;
  ptrs.delete(e.pointerId);
  if(ptrs.size === 0){
    // 2-Finger-Tap (kurz, wenig Bewegung) = Smart Zoom
    if(touchPinch && performance.now() - touchPan?.t < 220 && touchPinch.d < 30){
      const r = board.getBoundingClientRect();
      const cx = touchPinch.cx - r.left, cy = touchPinch.cy - r.top;
      const wx = (cx - S.x)/S.z, wy = (cy - S.y)/S.z;
      S.z = (S.z > .85) ? Math.max(.35, S.z / 2) : Math.min(2, S.z * 2);
      S.x = cx - wx * S.z; S.y = cy - wy * S.z;
      animate(); apply();
    }
    touchPinch = null; touchPan = null;
  }
});

/* ── Doppelklick = 100 %-Zoom am Punkt (statt fit) ───────────── */
board.addEventListener("dblclick", (e)=>{
  const r = board.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  if(S.z > .85 || S.z < .35){
    fit(true);
  } else {
    const wx = (mx - S.x)/S.z, wy = (my - S.y)/S.z;
    S.z = 1;
    S.x = mx - wx; S.y = my - wy;
    animate(); apply();
  }
}, true); // Capture: ersetzt den simplen fit-Handler im Template

})();
