// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
// =====================================================================
//  Mural / puzle: amplía el diseño actual (foto, texto, crucigrama,
//  mandala, plantilla…) y lo divide en piezas (tiras de rollo continuo
//  o etiquetas) que se imprimen por separado y se pegan juntas.
//  Es un modo del panel de impresión: «Etiqueta» o «Mural».
//  Se carga después de app.js y creativo.js y usa sus funciones.
//  Todo se calcula en puntos de impresión (8 por mm).
// =====================================================================

const MURAL_KEY = "pm270.mural.v2";
const MURAL_BAND = 16; // franja para marcas de corte: 2 mm
const MURAL_SAFE = 16; // a los lados el papel pierde ~2 mm (no se imprime bien): ahí van las líneas de corte
const MURAL_TAIL = 48; // cola con el número en rollo continuo: 6 mm
const MURAL_MAX_PIECES = 60;
const MURAL_FONT = '"Segoe UI", system-ui, sans-serif';

const mural = {
  active: false,
  cols: 3,
  rows: 1,
  rotate: false,
  fit: "cover",
  overlapMm: 0,
  stripMm: 100,
  numbers: true,
  selected: new Set(),
  printed: new Set(),
  sceneVersion: 0,
  composing: false,
  cache: null,
  geo: null,
  timer: null
};

function muralActive() {
  return mural.active;
}

function muralLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(MURAL_KEY) || "{}");
    for (const k of ["cols", "rows", "rotate", "fit", "overlapMm", "stripMm", "numbers"]) {
      if (s[k] !== undefined) mural[k] = s[k];
    }
  } catch {}
}

function muralSave() {
  try {
    const { cols, rows, rotate, fit, overlapMm, stripMm, numbers } = mural;
    localStorage.setItem(MURAL_KEY, JSON.stringify({ cols, rows, rotate, fit, overlapMm, stripMm, numbers }));
  } catch {}
}

const isContinuousPaper = () => $("paperMode").value !== "label";
const mmOf = (dots) => Math.round((dots / DOTS_PER_MM) * 10) / 10;

// --- Medidas ---
// La PM270 imprime 48 mm a lo ancho y el papel mide 50–54 mm: a los lados
// siempre queda un borde blanco que hay que recortar. A lo largo, en cambio,
// imprime hasta donde se quiera. Por eso las marcas de corte van siempre en
// dos franjas a lo largo (antes y después de la imagen): en rollo continuo no
// quitan nada de imagen; en etiquetas quitan 2 mm arriba y 2 mm abajo.
function muralGeometry() {
  const area = getPrintArea();
  const across = area.w - 2 * MURAL_SAFE;
  const cont = isContinuousPaper();
  const b = MURAL_BAND;
  const alongImg = cont
    ? Math.round(Math.max(20, Math.min(400, Number(mural.stripMm) || 100)) * DOTS_PER_MM)
    : Math.max(40, labelPrintHeight() - 2 * b);
  const iw = mural.rotate ? alongImg : across;
  const ih = mural.rotate ? across : alongImg;
  const ov = Math.round(Math.max(0, Math.min(20, Number(mural.overlapMm) || 0)) * DOTS_PER_MM);
  const ovx = Math.min(ov, Math.floor(iw / 2));
  const ovy = Math.min(ov, Math.floor(ih / 2));
  const { cols, rows } = mural;
  const tail = cont && mural.numbers ? MURAL_TAIL : 0;
  return {
    area, across, alongImg, b, cont, tail, iw, ih, ovx, ovy, cols, rows,
    bitmapH: cont ? alongImg + 2 * b + tail : labelPrintHeight(),
    stepX: iw - ovx,
    stepY: ih - ovy,
    MW: cols * iw - (cols - 1) * ovx,
    MH: rows * ih - (rows - 1) * ovy
  };
}

function labelPrintHeight() {
  const totalDots = Math.round((Number($("labelHeightMm").value) || 30) * DOTS_PER_MM);
  return Math.max(16, totalDots - getMarginY() * 2);
}

// --- Diseño ampliado ---
// Zona del diseño que se amplía: lo que cabe en el papel de «Así quedará».
function designBox() {
  const area = getPrintArea();
  return { x: area.x0, y: 0, w: area.w, h: canvas.height };
}

// Mural entero a tamaño de impresión y ya en blanco y negro. La foto se vuelve
// a dibujar a tamaño grande (no se amplía la etiqueta pixelada) y el tramado se
// hace sobre el mural completo para que no se noten las uniones.
function muralBitmap(geo) {
  if (!hasPrintableContent()) return null;
  const box = designBox();
  const key = [mural.sceneVersion, geo.MW, geo.MH, mural.fit, box.w, box.h,
    $("binarizeMode").value, $("brightness").value, $("contrast").value].join("|");
  if (mural.cache && mural.cache.key === key) return mural.cache.canvas;

  const k = mural.fit === "cover" ? Math.max(geo.MW / box.w, geo.MH / box.h) : Math.min(geo.MW / box.w, geo.MH / box.h);
  const offX = (geo.MW - box.w * k) / 2;
  const offY = (geo.MH - box.h * k) / 2;

  const c = document.createElement("canvas");
  c.width = geo.MW;
  c.height = geo.MH;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";

  // Fotos y textos con la misma posición, tamaño y giro que en la etiqueta,
  // vueltos a dibujar en grande (las fotos se traman ya a tamaño de mural).
  composeLayers(g, geo.MW, geo.MH, { k, ox: offX - box.x * k, oy: offY - box.y * k });

  if (frameLayer.style && typeof drawFrame === "function") {
    // El marco es vectorial: sale nítido.
    const t = document.createElement("canvas");
    t.width = geo.MW;
    t.height = geo.MH;
    const tg = t.getContext("2d", { willReadFrequently: true });
    tg.setTransform(k, 0, 0, k, offX - box.x * k, offY - box.y * k);
    drawFrame(tg, frameLayer.style, getPrintArea(), canvas.height, isRoundPaper());
    const td = tg.getImageData(0, 0, t.width, t.height).data;
    const id = g.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (td[i + 3] > 110) d[i] = d[i + 1] = d[i + 2] = td[i] < 128 ? 0 : 255;
      d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }

  mural.cache = { key, canvas: c };
  return c;
}

// --- Piezas ---
// Lienzo listo para imprimir (384 puntos de ancho): trozo del mural (girado si
// hace falta) centrado en la zona imprimible, con las franjas de corte y, en
// rollo continuo, una cola recortable con el número.
function renderPieceBitmap(bmp, r, c, geo) {
  const out = document.createElement("canvas");
  out.width = PRINT_WIDTH;
  out.height = geo.bitmapH;
  const g = out.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, out.width, out.height);

  const x0 = geo.area.x0 + MURAL_SAFE; // empieza la imagen a lo ancho
  const x1 = x0 + geo.across;
  const y0 = geo.b; // empieza la imagen
  const y1 = geo.b + geo.alongImg; // acaba la imagen

  g.save();
  g.translate(x0, y0);
  if (mural.rotate) {
    g.translate(geo.across, 0);
    g.rotate(Math.PI / 2);
  }
  g.drawImage(bmp, c * geo.stepX, r * geo.stepY, geo.iw, geo.ih, 0, 0, geo.iw, geo.ih);
  g.restore();

  // Líneas de corte alrededor de la imagen, a 1 punto de ella y de 2 puntos de
  // grosor: se corta por la línea y la imagen queda entera para unirla con la
  // pieza de al lado. A lo ancho son continuas; a lo largo, de rayas.
  g.fillStyle = "#000000";
  const L = x0 - 3;
  const R = x1 + 1;
  g.fillRect(L, y0 - 6, 2, geo.alongImg + 12);
  g.fillRect(R, y0 - 6, 2, geo.alongImg + 12);
  for (const y of [y0 - 3, y1 + 1]) {
    for (let x = L - 6; x < R + 8; x += 10) g.fillRect(x, y, 6, 2);
  }

  const n = r * geo.cols + c + 1;
  if (mural.numbers) {
    const where = `${n} · fila ${r + 1}, col ${c + 1}${mural.rotate ? " · girada" : ""}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (geo.tail) {
      g.font = `bold 20px ${MURAL_FONT}`;
      g.fillText(`Pieza ${where}`, geo.area.cx, y1 + geo.b + geo.tail / 2);
    } else {
      g.font = `bold 12px ${MURAL_FONT}`;
      g.fillText(where, geo.area.cx, (y0 - 3) / 2);
    }
  }

  // Nada de grises.
  const id = g.getImageData(0, 0, out.width, out.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > 127 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return out;
}

// --- Guía de montaje (en la vista previa) ---
function drawMuralGuide() {
  const cv = $("muralGuide");
  const desk = $("stickerDesk");
  const geo = mural.geo;
  if (!geo) return;
  const bmp = muralBitmap(geo);
  const availW = Math.max(160, desk.clientWidth - 48);
  const availH = Math.max(120, desk.clientHeight - 48);
  const s = Math.min(availW / geo.MW, availH / geo.MH, 2);
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = `${Math.round(geo.MW * s)}px`;
  cv.style.height = `${Math.round(geo.MH * s)}px`;
  cv.width = Math.round(geo.MW * s * dpr);
  cv.height = Math.round(geo.MH * s * dpr);
  const g = cv.getContext("2d");
  g.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, geo.MW, geo.MH);
  if (bmp) g.drawImage(bmp, 0, 0);
  const px = 1 / s;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim() || "#2463eb";
  for (let r = 0; r < geo.rows; r++) {
    for (let c = 0; c < geo.cols; c++) {
      const n = r * geo.cols + c;
      const x = c * geo.stepX;
      const y = r * geo.stepY;
      const sel = mural.selected.has(n);
      const done = mural.printed.has(n);
      if (!sel) {
        g.fillStyle = "rgba(255, 255, 255, 0.55)";
        g.fillRect(x, y, geo.iw, geo.ih);
      }
      g.lineWidth = 2 * px;
      g.strokeStyle = sel ? accent : "#8a909c";
      g.setLineDash(sel ? [] : [5 * px, 4 * px]);
      g.strokeRect(x + px, y + px, geo.iw - 2 * px, geo.ih - 2 * px);
      g.setLineDash([]);
      const rr = Math.max(11 * px, Math.min(geo.iw, geo.ih) * 0.12);
      const cx = x + geo.iw / 2;
      const cy = y + geo.ih / 2;
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.fillStyle = done ? "#1f9d55" : sel ? accent : "#687080";
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = `600 ${rr * 1.05}px ${MURAL_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(done ? "✓" : String(n + 1), cx, cy + rr * 0.04);
      if (mural.numbers) {
        // Etiqueta que sale impresa en la pieza (fuera de la imagen, se recorta).
        const t = `${n + 1} · fila ${r + 1}, col ${c + 1}`;
        g.font = `600 ${10 * px}px ${MURAL_FONT}`;
        const tw = g.measureText(t).width + 8 * px;
        g.fillStyle = "rgba(255, 255, 255, 0.9)";
        g.fillRect(cx - tw / 2, y + 3 * px, tw, 14 * px);
        g.fillStyle = "#1b1b1b";
        g.fillText(t, cx, y + 10 * px);
      }
    }
  }
  if (geo.ovx || geo.ovy) {
    g.fillStyle = "rgba(217, 119, 6, 0.22)";
    for (let c = 1; c < geo.cols; c++) g.fillRect(c * geo.stepX, 0, geo.ovx, geo.MH);
    for (let r = 1; r < geo.rows; r++) g.fillRect(0, r * geo.stepY, geo.MW, geo.ovy);
  }
  $("muralEmpty").hidden = Boolean(bmp);
}

function muralSteps(geo) {
  const kind = geo.cont ? "tira" : "etiqueta";
  const steps = [
    "Imprime las piezas. Van numeradas de izquierda a derecha y de arriba abajo, como en la vista previa.",
    geo.tail
      ? "Corta cada tira por las dos líneas de puntos. La cola con el número guárdala al lado de su pieza hasta pegarla."
      : `Corta cada ${kind} por las dos líneas de puntos (se va el número, que está fuera de la imagen).`,
    "Corta también por las dos líneas de los lados. Así cada pieza queda justo del tamaño de su trozo de imagen y, al juntarlas, las figuras quedan enteras.",
    mural.rotate ? `Las piezas salen giradas: colócalas tumbadas, como en la vista previa${geo.tail ? " (la cola del número queda a la derecha)" : ""}.` : "",
    geo.ovx || geo.ovy ? `Cada pieza repite ${mural.overlapMm} mm de la siguiente (zona naranja): pégalas solapando esa franja.` : "Pega las piezas borde con borde, empezando por la 1.",
  ];
  return steps.filter(Boolean);
}

function updateMural() {
  if (!mural.active) return;
  const geo = muralGeometry();
  mural.geo = geo;
  const total = geo.cols * geo.rows;
  for (const n of [...mural.selected]) if (n >= total) mural.selected.delete(n);
  for (const n of [...mural.printed]) if (n >= total) mural.printed.delete(n);

  $("muralStripWrap").hidden = !geo.cont;
  $("previewMeta").textContent = `Mural ${mmOf(geo.MW)} × ${mmOf(geo.MH)} mm`;
  $("muralSize").textContent = `${mmOf(geo.MW)} × ${mmOf(geo.MH)} mm`;
  $("muralCount").textContent = `${total} ${total === 1 ? "pieza" : "piezas"} de ${mmOf(geo.iw)}×${mmOf(geo.ih)}`;
  $("muralCount").title = "Medida de la imagen en cada pieza, en mm";
  $("muralWarn").hidden = !isRoundPaper();
  drawMuralGuide();
  muralUpdateUI();
}

function scheduleMural() {
  if (!mural.active) return;
  clearTimeout(mural.timer);
  mural.timer = setTimeout(updateMural, 120);
}

// La llama renderScene() cada vez que cambia el diseño.
function onSceneChanged() {
  if (mural.composing) return;
  mural.sceneVersion++;
  scheduleMural();
}

// La llama updateUI(): en modo mural el botón grande imprime piezas.
function muralUpdateUI() {
  if (!mural.active) return;
  const n = mural.selected.size;
  const btn = $("btnPrint");
  btn.disabled = state.isBusy || !n || !isConnected() || !hasPrintableContent() || isRoundPaper();
  if (!state.isBusy) btn.textContent = !n ? "Elige piezas" : n === 1 ? "Imprimir 1 pieza" : `Imprimir ${n} piezas`;
}

function readMuralForm() {
  const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || d));
  mural.cols = clampInt($("muralCols").value, 1, 10, 3);
  mural.rows = clampInt($("muralRows").value, 1, 10, 1);
  if (mural.cols * mural.rows > MURAL_MAX_PIECES) mural.rows = Math.floor(MURAL_MAX_PIECES / mural.cols);
  mural.rotate = $("muralRotate").checked;
  mural.fit = $("muralFit").value;
  mural.overlapMm = Math.max(0, Math.min(20, Number($("muralOverlap").value) || 0));
  mural.stripMm = clampInt($("muralStrip").value, 20, 400, 100);
  mural.numbers = $("muralNumbers").checked;
  muralSave();
}

function writeMuralForm() {
  $("muralCols").value = mural.cols;
  $("muralRows").value = mural.rows;
  $("muralRotate").checked = mural.rotate;
  $("muralFit").value = mural.fit;
  $("muralOverlap").value = mural.overlapMm;
  $("muralStrip").value = mural.stripMm;
  $("muralNumbers").checked = mural.numbers;
}

function selectAllPieces(on) {
  mural.selected.clear();
  if (on) for (let i = 0; i < mural.cols * mural.rows; i++) mural.selected.add(i);
}

// Filas que mejor encajan con la forma del diseño para las columnas elegidas.
function fitRowsToDesign() {
  const box = designBox();
  const geo = muralGeometry();
  const wantH = (geo.MW * box.h) / box.w;
  $("muralRows").value = Math.max(1, Math.min(10, Math.round((wantH - geo.ovy) / geo.stepY) || 1));
}

async function printMural() {
  const geo = muralGeometry();
  const bmp = muralBitmap(geo);
  if (!bmp) return;
  const order = [...mural.selected].sort((a, b) => a - b);
  const items = order.map((n) => {
    const r = Math.floor(n / geo.cols);
    const c = n % geo.cols;
    return { ...buildPrintJob(renderPieceBitmap(bmp, r, c, geo)), name: `Pieza ${n + 1}`, n };
  });
  await printQueue(items, {
    onPrinted: (it) => {
      mural.printed.add(it.n);
      mural.selected.delete(it.n);
      drawMuralGuide();
    }
  });
  muralUpdateUI();
}

function setMuralMode(on) {
  const was = mural.active;
  mural.active = on;
  if (on && !was && hasPrintableContent()) {
    toast("En modo mural no se pueden mover los textos ni las imágenes: colócalos antes en «Etiqueta» y luego vuelve aquí.", "info", 7000);
  }
  if (typeof renderLayersList === "function") renderLayersList();
  $("modeLabel").classList.toggle("active", !on);
  $("modeMural").classList.toggle("active", on);
  $("modeLabel").setAttribute("aria-pressed", String(!on));
  $("modeMural").setAttribute("aria-pressed", String(on));
  $("labelPane").hidden = on;
  $("muralPane").hidden = !on;
  $("stickerDesk").classList.toggle("mural-on", on);
  $("labelHint").hidden = on;
  $("muralHint").hidden = !on;
  state.selectedLayer = null;
  if (on) {
    writeMuralForm();
    if (!mural.selected.size && !mural.printed.size) selectAllPieces(true);
    mural.sceneVersion++;
    updateMural();
  } else {
    renderScene();
  }
  updateUI();
}

function setupMural() {
  muralLoad();
  $("modeLabel").addEventListener("click", () => setMuralMode(false));
  $("modeMural").addEventListener("click", () => setMuralMode(true));

  for (const id of ["muralCols", "muralRows", "muralOverlap", "muralStrip"]) {
    $(id).addEventListener("input", () => {
      const before = mural.cols * mural.rows;
      readMuralForm();
      if (mural.cols * mural.rows !== before) {
        mural.printed.clear();
        selectAllPieces(true);
      }
      scheduleMural();
    });
  }
  for (const id of ["muralRotate", "muralFit", "muralNumbers"]) {
    $(id).addEventListener("change", () => {
      readMuralForm();
      scheduleMural();
    });
  }
  $("muralFitRows").addEventListener("click", () => {
    fitRowsToDesign();
    readMuralForm();
    mural.printed.clear();
    selectAllPieces(true);
    updateMural();
  });
  $("muralAll").addEventListener("click", () => {
    selectAllPieces(true);
    drawMuralGuide();
    muralUpdateUI();
  });
  $("muralNone").addEventListener("click", () => {
    selectAllPieces(false);
    drawMuralGuide();
    muralUpdateUI();
  });

  $("muralGuide").addEventListener("click", (ev) => {
    const geo = mural.geo;
    if (!geo || state.isBusy) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * geo.MW;
    const y = ((ev.clientY - rect.top) / rect.height) * geo.MH;
    const c = Math.min(geo.cols - 1, Math.max(0, Math.floor(x / geo.stepX)));
    const r = Math.min(geo.rows - 1, Math.max(0, Math.floor(y / geo.stepY)));
    const n = r * geo.cols + c;
    if (mural.selected.has(n)) mural.selected.delete(n);
    else mural.selected.add(n);
    drawMuralGuide();
    muralUpdateUI();
  });

  const how = $("muralHowDialog");
  $("muralHow").addEventListener("click", () => {
    $("muralSteps").innerHTML = muralSteps(mural.geo || muralGeometry()).map((t) => `<li>${t}</li>`).join("");
    how.showModal();
  });
  how.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => how.close()));
  how.addEventListener("click", (ev) => {
    if (ev.target === how) how.close();
  });

  $("muralSaveGuide").addEventListener("click", () => {
    // En la app Android la guía se guarda en Imágenes del móvil.
    if (window.PM270Native) {
      const b64 = $("muralGuide").toDataURL("image/png").split(",")[1];
      window.PM270Native.saveImage(`guia-mural-${mural.cols}x${mural.rows}.png`, b64);
      return;
    }
    $("muralGuide").toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `guia-mural-${mural.cols}x${mural.rows}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  });

  window.addEventListener("resize", () => {
    if (mural.active) drawMuralGuide();
  });
}

setupMural();
