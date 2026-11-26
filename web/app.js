// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
const PRINT_WIDTH = 384; // 48 mm @ 203 DPI (8 dots/mm)
const DOTS_PER_MM = 8;

// --- Tipos de papel ---
// w/h en mm. type: "label" (etiqueta troquelada) o "continuous" (rollo continuo).
// El perfil por defecto (54×30) reproduce exactamente el comportamiento original.
const PAPER_PROFILES = [
  { id: "l54x30", name: "Etiqueta 54×30 mm", type: "label", w: 54, h: 30, gap: 3, use: "La de siempre: nombres, tarros, cables y material escolar." },
  { id: "l50x30", name: "Etiqueta 50×30 mm", type: "label", w: 50, h: 30, gap: 2, use: "Tarros, cajas y material escolar." },
  { id: "l50x20", name: "Etiqueta 50×20 mm", type: "label", w: 50, h: 20, gap: 2, use: "Cables, bolígrafos y botes de especias pequeños. Texto corto." },
  { id: "l50x40", name: "Etiqueta 50×40 mm", type: "label", w: 50, h: 40, gap: 2, use: "Tarros grandes y táperes del congelador (contenido + fecha)." },
  { id: "l50x50", name: "Etiqueta 50×50 mm", type: "label", w: 50, h: 50, gap: 2, use: "Cuadradas: fotos, dibujos y códigos QR." },
  { id: "l50x80", name: "Etiqueta 50×80 mm", type: "label", w: 50, h: 80, gap: 2, use: "Listas cortas pegables, cajas de mudanza y paquetes." },
  { id: "r50", name: "Redonda Ø50 mm", type: "label", w: 50, h: 50, gap: 2, round: true, use: "Pegatinas para niños, tapas de tarros y regalos." },
  { id: "l40x30", name: "Etiqueta 40×30 mm (más estrecha)", type: "label", w: 40, h: 30, gap: 2, use: "Etiquetas pequeñas. Prueba primero con una sola etiqueta." },
  { id: "c54", name: "Rollo continuo 50–54 mm", type: "continuous", w: 54, h: 0, gap: 0, use: "Listas de la compra, notas y textos largos. El largo se ajusta solo." },
  { id: "custom", name: "Personalizado (ajustes avanzados)", type: null, use: "Usa los valores de «Ajustes de papel e imagen»." }
];

const PROFILE_GROUPS = [
  { label: "Etiquetas rectangulares", match: (p) => p.type === "label" && !p.round },
  { label: "Etiquetas redondas", match: (p) => p.round },
  { label: "Rollo continuo", match: (p) => p.type === "continuous" },
  { label: "Otros", match: (p) => p.id === "custom" }
];

// Texto de búsqueda en Amazon para cada tipo (búsqueda, no un producto concreto).
function buySearchQuery(p) {
  if (!p || p.id === "custom") return "papel termico sin fenoles 50mm";
  if (p.type === "continuous") return `rollo papel termico ${p.w}mm sin fenoles BPA BPS`;
  if (p.round) return `etiquetas termicas redondas ${p.w}mm sin BPA`;
  return `etiquetas termicas ${p.w}x${p.h} mm sin BPA`;
}

function getProfile(id) {
  return PAPER_PROFILES.find((p) => p.id === id) || null;
}

const state = {
  serialPort: null,
  serialWriter: null,
  serialReader: null,
  isBusy: false,
  selectedLayer: null,
  hoverLayer: null,
  rxBuffer: new Uint8Array(0),
  rxTimer: null,
  batteryTimer: null,
  waiters: [],
  userDisconnected: false,
  drag: {
    active: false,
    layer: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0
  }
};

// Capas: varias imágenes y varios textos, de abajo arriba en «layers».
// imgLayer y textLayer apuntan a la imagen y al texto que se están editando
// (los controles de la izquierda actúan sobre ellos).
let layerSeq = 0;
let layers = [];

let imgLayer = {
  kind: "image",
  id: ++layerSeq,
  name: "",
  source: null,
  cx: PRINT_WIDTH / 2,
  cy: 108,
  baseScale: 1,
  zoom: 1,
  rotation: 0
};

let textLayer = {
  kind: "text",
  id: ++layerSeq,
  text: "",
  cx: PRINT_WIDTH / 2,
  cy: 108,
  fontSize: 30,
  align: "center",
  rotation: 0
};

// Marco decorativo (lo dibuja creativo.js). style = id del marco o null.
const frameLayer = { style: null, scale: 100 };

const $ = (id) => document.getElementById(id);
const canvas = $("previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const overlay = $("overlayCanvas");
const octx = overlay.getContext("2d");
const textOffscreen = document.createElement("canvas");
const tctx = textOffscreen.getContext("2d", { willReadFrequently: true });
const logEl = $("log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// --- Avisos en pantalla ---
function toast(msg, type = "info", ms = 5000) {
  const box = $("toasts");
  if (!box) return;
  // Con una ventana abierta (p. ej. el mural) los avisos van dentro de ella para que se vean.
  const open = document.querySelector("dialog[open]");
  const host = open || document.body;
  if (box.parentElement !== host) host.appendChild(box);
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  el.addEventListener("click", () => el.remove());
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// --- Ajustes guardados en el navegador ---
const SETTINGS_KEY = "pm270.settings.v1";
const PERSISTED_IDS = [
  "paperProfile",
  "paperWidthMm",
  "paperMode",
  "labelHeightMm",
  "density",
  "marginY",
  "binarizeMode",
  "brightness",
  "contrast",
  "chkSendGap",
  "gapMm",
  "invertBits",
  "textAlign",
  "fontSize",
  "chkStatusCheck",
  "chkListMode",
  "chkIgnoreChip",
  "chkOnlyFavs"
];

function saveSettings() {
  const data = {};
  for (const id of PERSISTED_IDS) {
    const el = $(id);
    if (!el) continue;
    data[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch {}
}

function loadSettings() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
  } catch {}
  if (!data || typeof data !== "object") return;
  for (const id of PERSISTED_IDS) {
    const el = $(id);
    if (!el || !(id in data)) continue;
    if (el.type === "checkbox") el.checked = Boolean(data[id]);
    else el.value = String(data[id]);
  }
  textLayer.fontSize = Math.max(14, Number($("fontSize").value) || 30);
  $("fontSizeVal").textContent = String(textLayer.fontSize);
  textLayer.align = $("textAlign").value;
  updateRangeLabels();
  $("labelHeightWrap").style.display = $("paperMode").value === "label" ? "inline-flex" : "none";
}

function rememberPort(port) {
  try {
    const info = port.getInfo ? port.getInfo() : {};
    localStorage.setItem("pm270.port", JSON.stringify(info || {}));
  } catch {}
}

function getRememberedPortInfo() {
  try {
    return JSON.parse(localStorage.getItem("pm270.port") || "null");
  } catch {
    return null;
  }
}

function toHex(uint8) {
  return Array.from(uint8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function isConnected() {
  return Boolean(state.serialPort && state.serialWriter);
}

function hasPrintableContent() {
  syncLayers();
  return Boolean(layers.length || frameLayer.style);
}

function getMarginY() {
  return Math.max(0, Math.min(32, Number($("marginY").value) || 0));
}

// Zona imprimible en horizontal. Con papel de 50 mm o más es todo el ancho (384 dots);
// con papel más estrecho se centra y lo de fuera se deja en blanco.
function getPaperWidthMm() {
  return Math.max(20, Math.min(54, Number($("paperWidthMm").value) || 54));
}

// Para papel de 48 mm o más se manda SIZE 54 mm como siempre (es lo probado).
// Solo el papel más estrecho manda su ancho real.
function getSizeWidthMm() {
  const w = getPaperWidthMm();
  return w >= 48 ? 54 : w;
}

function getPrintArea() {
  const dots = Math.min(PRINT_WIDTH, Math.round((getPaperWidthMm() - 2) * DOTS_PER_MM / 8) * 8);
  const x0 = Math.round((PRINT_WIDTH - dots) / 2);
  return { x0, x1: x0 + dots, w: dots, cx: x0 + dots / 2 };
}

function isRoundPaper() {
  const p = getProfile($("paperProfile").value);
  return Boolean(p && p.round);
}

function getCanvasTargetHeight() {
  const my = getMarginY();
  if ($("paperMode").value === "label") {
    const totalDots = Math.round((Number($("labelHeightMm").value) || 30) * DOTS_PER_MM);
    return Math.max(16, totalDots - my * 2);
  }
  // Rollo continuo: el largo lo marca la capa más larga.
  let best = 0;
  for (const l of allLayersForSize()) {
    if (l.kind === "image") {
      const rot90 = l.rotation % 180 !== 0;
      const srcH = rot90 ? l.source.width : l.source.height;
      const srcW = rot90 ? l.source.height : l.source.width;
      best = Math.max(best, Math.max(80, Math.round(((srcH * getPrintArea().w) / srcW) * l.zoom)));
    } else {
      const block = withTextLayer(l, measureTextBlock);
      if (block) best = Math.max(best, Math.max(80, block.height + 24));
    }
  }
  return best || 216;
}

function syncCanvasSize(height) {
  if (canvas.width !== PRINT_WIDTH || canvas.height !== height) {
    canvas.width = PRINT_WIDTH;
    canvas.height = height;
  }
  if (overlay.width !== PRINT_WIDTH || overlay.height !== height) {
    overlay.width = PRINT_WIDTH;
    overlay.height = height;
  }
  if (textOffscreen.width !== PRINT_WIDTH || textOffscreen.height !== height) {
    textOffscreen.width = PRINT_WIDTH;
    textOffscreen.height = height;
  }
  const continuous = $("paperMode") && $("paperMode").value !== "label";
  $("previewMeta").textContent = continuous
    ? `Largo ${Math.round(height / 8)} mm (se ajusta al contenido)`
    : `${PRINT_WIDTH}×${height} px`;
}

function updateUI() {
  const connected = isConnected();
  const statusPill = $("statusPill");

  if (connected) {
    statusPill.textContent = "Conectada";
    statusPill.className = "pill ok";
  } else {
    statusPill.textContent = "Desconectada";
    statusPill.className = "pill off";
    $("batteryPill").textContent = "--%";
    $("batteryPill").className = "pill i i-battery";
  }

  $("btnConnectSerial").disabled = state.isBusy || Boolean(state.opening);
  $("btnConnectSerial").textContent = state.opening ? "Conectando…" : "Conectar impresora";
  $("btnDisconnect").disabled = !connected || state.isBusy;
  $("btnPrint").disabled = !connected || state.isBusy || !hasPrintableContent();
  $("btnPrint").textContent = state.isBusy ? "Imprimiendo…" : "Imprimir etiqueta";
  $("btnStatusByte").disabled = !connected || state.isBusy;
  $("btnLabelBlock").disabled = !connected || state.isBusy;
  $("btnSelftest").disabled = !connected || state.isBusy;
  document.querySelectorAll(".cmd-btn").forEach((b) => (b.disabled = !connected || state.isBusy));
  if (typeof muralUpdateUI === "function") muralUpdateUI();
  if (!state.isBusy && isPerLine()) updatePerLineInfo(perLineLines());
}

// --- Geometría y ajuste limpio de texto ---
function getImageBounds(l = imgLayer) {
  if (!l.source) return null;
  const s = l.baseScale * l.zoom;
  const rawW = l.source.width * s;
  const rawH = l.source.height * s;
  const rot90 = l.rotation % 180 !== 0;
  const w = rot90 ? rawH : rawW;
  const h = rot90 ? rawW : rawH;
  return {
    x: l.cx - w / 2,
    y: l.cy - h / 2,
    w,
    h,
    rawW,
    rawH
  };
}

function wrapTextLines(rawText, maxWidth) {
  const lines = [];
  for (const para of rawText.split("\n")) {
    if (para === "") {
      lines.push("");
      continue;
    }
    const words = para.split(" ");
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (tctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = "";
        }
        if (tctx.measureText(word).width > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            const testChunk = chunk + ch;
            if (tctx.measureText(testChunk).width > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk = testChunk;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    lines.push(current);
  }
  return lines;
}

// --- Fecha automática ---
// En el texto se pueden poner marcas que se cambian al imprimir:
// {hoy}  {hoy+7}  {hoy-1}  {dia} (lunes…)  {mes} (noviembre…)  {año}  {hora}
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function expandTokens(text) {
  if (!text || text.indexOf("{") < 0) return text;
  const now = new Date();
  return text.replace(/\{(hoy|fecha)\s*([+-]\s*\d+)?\}|\{(dia|día|mes|año|anio|hora)\}/gi, (m, h, off, other) => {
    if (h) {
      const d = new Date(now);
      if (off) d.setDate(d.getDate() + Number(off.replace(/\s/g, "")));
      return fmtDate(d);
    }
    const k = other.toLowerCase();
    if (k === "dia" || k === "día") return DIAS[now.getDay()];
    if (k === "mes") return MESES[now.getMonth()];
    if (k === "hora") return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return String(now.getFullYear());
  });
}

// --- Modo lista con casillas ---
// Cada línea es un elemento con casilla. «# Título» = título sin casilla.
// «[x] algo» o «x algo» = casilla ya marcada. Las líneas largas continúan sangradas.
function isListMode() {
  return $("chkListMode").checked;
}

function fontFor(size) {
  return `bold ${size}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
}

function buildListItems(raw, maxWidth, fontSize) {
  const lineHeight = Math.round(fontSize * 1.18);
  const box = Math.round(fontSize * 0.72);
  const indent = box + Math.round(fontSize * 0.35);
  const titleSize = Math.round(fontSize * 1.15);
  const items = [];

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      items.push({ kind: "blank", h: Math.round(lineHeight * 0.5), w: 0 });
      continue;
    }
    if (line.startsWith("#")) {
      tctx.font = fontFor(titleSize);
      const text = line.replace(/^#+\s*/, "");
      const parts = wrapTextLines(text, maxWidth);
      for (const part of parts) {
        items.push({ kind: "title", text: part, size: titleSize, h: Math.round(titleSize * 1.25), w: tctx.measureText(part).width });
      }
      continue;
    }
    let checked = false;
    let text = line.replace(/^[-*•]\s+/, "");
    const m = text.match(/^(\[[xX ]?\]|[xX✓✔])\s+(.*)$/);
    if (m) {
      checked = /[xX✓✔]/.test(m[1]);
      text = m[2];
    }
    tctx.font = fontFor(fontSize);
    const parts = wrapTextLines(text, maxWidth - indent);
    parts.forEach((part, i) => {
      items.push({
        kind: i === 0 ? "item" : "cont",
        text: part,
        checked,
        size: fontSize,
        box,
        indent,
        h: lineHeight,
        w: indent + tctx.measureText(part).width
      });
    });
  }
  // Quitar huecos sobrantes al final
  while (items.length && items[items.length - 1].kind === "blank") items.pop();
  return items;
}

// Mide el bloque de texto sin depender del alto del lienzo
// (en rollo continuo el alto depende del texto: así se evita un bucle infinito).
function measureTextBlock() {
  const raw = expandTokens(textLayer.text).trimEnd();
  if (!raw.trim()) return null;
  const fontSize = textLayer.fontSize;
  const lineHeight = Math.round(fontSize * 1.18);
  tctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  if (textLayer.rotation % 180 !== 0) {
    // Texto girado en rollo continuo: el largo del papel lo marca la línea más larga.
    const wrapW = ROTATED_CONTINUOUS_WRAP;
    let maxW = 0;
    if (isListMode()) {
      for (const it of buildListItems(raw, wrapW, fontSize)) maxW = Math.max(maxW, it.w);
    } else {
      for (const l of wrapTextLines(raw, wrapW)) maxW = Math.max(maxW, tctx.measureText(l).width);
    }
    return { height: Math.ceil(maxW) };
  }
  if (isListMode()) {
    const items = buildListItems(raw, getPrintArea().w - 16, fontSize);
    return { lines: items, height: items.reduce((a, it) => a + it.h, 0) };
  }
  const lines = wrapTextLines(raw, getPrintArea().w - 16);
  return { lines, height: lines.length * lineHeight };
}

// Largo máximo de línea con texto girado en rollo continuo (~200 mm).
const ROTATED_CONTINUOUS_WRAP = 1600;

function getTextLayout() {
  const raw = expandTokens(textLayer.text).trimEnd();
  if (!raw.trim()) return null;

  const fontSize = textLayer.fontSize;
  const lineHeight = Math.round(fontSize * 1.18);
  tctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;

  const area = getPrintArea();
  const rot90 = textLayer.rotation % 180 !== 0;
  // Girado 90°: las líneas van a lo largo de la etiqueta.
  const maxAllowed = !rot90
    ? area.w - 16
    : $("paperMode").value === "label"
    ? getCanvasTargetHeight() - 16
    : ROTATED_CONTINUOUS_WRAP;
  const listMode = isListMode();
  let lines;
  let maxLineW = 0;
  let height;
  if (listMode) {
    lines = buildListItems(raw, maxAllowed, fontSize);
    for (const it of lines) maxLineW = Math.max(maxLineW, it.w);
    height = lines.reduce((a, it) => a + it.h, 0);
  } else {
    lines = wrapTextLines(raw, maxAllowed);
    for (const l of lines) {
      maxLineW = Math.max(maxLineW, tctx.measureText(l).width);
    }
    height = lines.length * lineHeight;
  }
  const width = Math.min(maxAllowed, Math.max(20, Math.ceil(maxLineW)));

  // Caja que ocupa en la etiqueta (girada si hace falta)
  const boxW = rot90 ? height : width;
  const boxH = rot90 ? width : height;

  const minCx = area.x0 + boxW / 2 + 6;
  const maxCx = area.x1 - boxW / 2 - 6;
  const safeCx = minCx <= maxCx ? Math.max(minCx, Math.min(maxCx, textLayer.cx)) : area.cx;

  const targetH = getCanvasTargetHeight();
  const minCy = boxH / 2 + 4;
  const maxCy = targetH - boxH / 2 - 4;
  const safeCy = minCy <= maxCy ? Math.max(minCy, Math.min(maxCy, textLayer.cy)) : boxH / 2 + 4;

  textLayer.cx = safeCx;
  textLayer.cy = safeCy;

  return {
    listMode,
    lines,
    fontSize,
    lineHeight,
    width,
    height,
    rotation: textLayer.rotation,
    x: safeCx - boxW / 2,
    y: safeCy - boxH / 2,
    w: boxW,
    h: boxH
  };
}

// Capa que hay bajo el puntero (la de más arriba).
function hitTest(px, py) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    const b = layerBox(l);
    const pad = l.kind === "text" ? 8 : 0;
    if (b && px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return l;
  }
  return null;
}

function layerBox(l) {
  return l.kind === "text" ? withTextLayer(l, getTextLayout) : getImageBounds(l);
}

// Ejecuta fn con «l» como texto actual (las funciones de texto usan textLayer).
function withTextLayer(l, fn) {
  const prev = textLayer;
  textLayer = l;
  try {
    return fn();
  } finally {
    textLayer = prev;
  }
}

function newTextLayer() {
  return {
    kind: "text",
    id: ++layerSeq,
    text: "",
    cx: getPrintArea().cx,
    cy: canvas.height / 2,
    fontSize: Math.max(14, Number($("fontSize").value) || 30),
    align: $("textAlign").value,
    rotation: 0
  };
}

function newImageLayer() {
  return { kind: "image", id: ++layerSeq, name: "", source: null, original: null, crisp: false, gallery: false, cx: PRINT_WIDTH / 2, cy: 108, baseScale: 1, zoom: 1, rotation: 0 };
}

// Mete en la lista la imagen/texto actuales si tienen algo y quita las vacías.
function syncLayers() {
  if (imgLayer.source && !layers.includes(imgLayer)) {
    // Las imágenes nuevas van encima de las otras imágenes pero debajo de los textos.
    const firstText = layers.findIndex((l) => l.kind === "text");
    if (firstText < 0) layers.push(imgLayer);
    else layers.splice(firstText, 0, imgLayer);
  }
  if (textLayer.text.trim() && !layers.includes(textLayer)) layers.push(textLayer);
  layers = layers.filter((l) => (l.kind === "image" ? Boolean(l.source) : Boolean(l.text.trim())));
}

// Diseño en blanco: sin textos ni imágenes (el marco se queda).
function clearAllLayers() {
  layers = [];
  imgLayer = newImageLayer();
  textLayer = newTextLayer();
  $("textInput").value = "";
  $("textRotVal").textContent = "0°";
  $("fileInput").value = "";
  state.selectedLayer = null;
}

function allLayersForSize() {
  syncLayers();
  return layers;
}

function hasAnyLayer(kind) {
  return layers.some((l) => l.kind === kind);
}

// Elige una capa para editarla: los controles pasan a mostrar sus valores.
function selectLayer(l) {
  if (!l) {
    state.selectedLayer = null;
    return;
  }
  if (l.kind === "text") {
    textLayer = l;
    $("textInput").value = l.text;
    $("fontSize").value = String(l.fontSize);
    $("fontSizeVal").textContent = String(l.fontSize);
    $("textAlign").value = l.align;
    $("textRotVal").textContent = `${l.rotation}°`;
  } else {
    imgLayer = l;
    const z = Math.round(l.zoom * 100);
    $("imgScale").value = String(z);
    $("imgScaleVal").textContent = `${z}%`;
  }
  state.selectedLayer = l.kind;
}

// --- Renderizado 1-bit + Overlay visual ---
function applyBinarizationToCanvas(g = ctx, forcedMode = null, opts = null) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  const imgData = g.getImageData(0, 0, w, h);
  const d = imgData.data;

  const brightness = opts && opts.brightness !== undefined ? opts.brightness : Number($("brightness").value);
  const contrastVal = opts && opts.contrast !== undefined ? opts.contrast : Number($("contrast").value);
  const factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
  // Los gráficos generados (QR, calendarios, marcos…) se imprimen nítidos, sin tramado.
  const mode = forcedMode || (imgLayer.crisp ? "threshold" : $("binarizeMode").value);

  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    let lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    lum = factor * (lum - 128) + 128 + brightness;
    gray[i] = Math.max(0, Math.min(255, lum));
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldVal = gray[i];
      const newVal = oldVal < 128 ? 0 : 255;
      gray[i] = newVal;

      if (mode === "dither") {
        const err = oldVal - newVal;
        if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) gray[i + w - 1] += (err * 3) / 16;
          gray[i + w] += (err * 5) / 16;
          if (x + 1 < w) gray[i + w + 1] += (err * 1) / 16;
        }
      } else if (mode === "atkinson") {
        // Atkinson: reparte solo 6/8 del error. Da fotos más limpias y claras
        // en impresora térmica (menos manchas en sombras).
        const e = (oldVal - newVal) / 8;
        if (x + 1 < w) gray[i + 1] += e;
        if (x + 2 < w) gray[i + 2] += e;
        if (y + 1 < h) {
          if (x > 0) gray[i + w - 1] += e;
          gray[i + w] += e;
          if (x + 1 < w) gray[i + w + 1] += e;
        }
        if (y + 2 < h) gray[i + 2 * w] += e;
      }

      const idx = i * 4;
      d[idx] = d[idx + 1] = d[idx + 2] = newVal;
      d[idx + 3] = 255;
    }
  }
  g.putImageData(imgData, 0, 0);
}

function drawPaperGuide() {
  const area = getPrintArea();
  const round = isRoundPaper();
  if (!round && area.w >= PRINT_WIDTH) return;
  octx.save();
  octx.fillStyle = "rgba(120, 120, 135, 0.18)";
  octx.beginPath();
  octx.rect(0, 0, overlay.width, overlay.height);
  if (round) {
    const r = Math.min(area.w, overlay.height) / 2;
    octx.arc(area.cx, overlay.height / 2, r, 0, Math.PI * 2, true);
  } else {
    octx.rect(area.x1, 0, -(area.w), overlay.height);
  }
  octx.fill("evenodd");
  octx.restore();
}

// Deja en blanco lo que queda fuera del papel (bordes o fuera del círculo).
function maskOutsidePaper(targetH) {
  const area = getPrintArea();
  const round = isRoundPaper();
  if (!round && area.w >= PRINT_WIDTH) return;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.rect(0, 0, PRINT_WIDTH, targetH);
  if (round) {
    const r = Math.min(area.w, targetH) / 2;
    ctx.arc(area.cx, targetH / 2, r, 0, Math.PI * 2, true);
  } else {
    ctx.rect(area.x1, 0, -(area.w), targetH);
  }
  ctx.fill("evenodd");
  ctx.restore();
}

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  drawPaperGuide();
  if (typeof muralActive === "function" && muralActive()) return;
  const selected = state.selectedLayer === "text" ? textLayer : state.selectedLayer === "image" ? imgLayer : null;
  const target = state.drag.active ? state.drag.layer : state.hoverLayer || selected;
  if (!target || !layers.includes(target)) return;

  const box = layerBox(target);
  if (!box) return;

  octx.save();
  octx.strokeStyle = target.kind === "text" ? "#34c759" : "#007aff";
  octx.lineWidth = 2;
  octx.setLineDash([6, 4]);
  octx.strokeRect(
    Math.max(1, box.x),
    Math.max(1, box.y),
    Math.min(overlay.width - 2, Math.max(4, box.w)),
    Math.min(overlay.height - 2, Math.max(4, box.h))
  );
  octx.restore();
}

// Con «Una etiqueta por línea» la vista previa enseña una sola línea cada vez.
function renderScene() {
  if (isPerLine() && !state.lineOverride) {
    const full = textLayer.text;
    const lines = perLineLines();
    state.previewLine = Math.max(0, Math.min(lines.length - 1, state.previewLine || 0));
    textLayer.text = lines[state.previewLine] || "";
    try {
      renderSceneNow();
    } finally {
      textLayer.text = full;
    }
    updatePerLineInfo(lines);
    return;
  }
  renderSceneNow();
  if (typeof updatePerLineInfo === "function") updatePerLineInfo(null);
}

function renderSceneNow() {
  syncLayers();
  const targetH = getCanvasTargetHeight();
  syncCanvasSize(targetH);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PRINT_WIDTH, targetH);
  composeLayers(ctx, PRINT_WIDTH, targetH);

  if (frameLayer.style && typeof drawFrame === "function") {
    // Tamaño del marco (50–100 %), centrado en la etiqueta.
    const k = Math.max(50, Math.min(100, frameLayer.scale || 100)) / 100;
    const a = getPrintArea();
    if (k >= 1) {
      drawFrame(ctx, frameLayer.style, a, targetH, isRoundPaper());
    } else {
      const w = Math.round(a.w * k);
      const h = Math.round(targetH * k);
      const area = { x0: Math.round(a.cx - w / 2), x1: Math.round(a.cx + w / 2), w, cx: a.cx };
      ctx.save();
      ctx.translate(0, Math.round((targetH - h) / 2));
      drawFrame(ctx, frameLayer.style, area, h, isRoundPaper());
      ctx.restore();
    }
  }

  maskOutsidePaper(targetH);
  drawOverlay();
  if (typeof fitPreview === "function") fitPreview();
  updateUI();
  if (typeof onSceneChanged === "function") onSceneChanged();
  if (!state.lineOverride) {
    scheduleHistory();
    updateLayerChips();
  }
}

// Pinta todas las capas de abajo arriba sobre g, ya en blanco y negro.
// En el mural se usa con k (ampliación) y ox/oy (desplazamiento).
// Cada foto se trama por separado y tapa lo que tiene debajo; cada texto se
// pinta en negro encima de lo anterior.
function composeLayers(g, W, H, { k = 1, ox = 0, oy = 0 } = {}) {
  if (!layers.length) return;
  const out = g.getImageData(0, 0, W, H);
  const d = out.data;
  const labelSize = k === 1 && ox === 0 && oy === 0 && W === PRINT_WIDTH && textOffscreen.height === H;
  let tmp = null;
  let tg = null;
  const scratch = () => {
    if (labelSize) return tctx;
    if (!tg) {
      tmp = document.createElement("canvas");
      tmp.width = W;
      tmp.height = H;
      tg = tmp.getContext("2d", { willReadFrequently: true });
    }
    return tg;
  };
  for (const l of layers) {
    if (l.kind === "image") {
      if (!l.source) continue;
      const ib = getImageBounds(l);
      // Imagen sobre blanco, tramada con el modo elegido.
      const pc = document.createElement("canvas");
      pc.width = W;
      pc.height = H;
      const pg = pc.getContext("2d", { willReadFrequently: true });
      pg.fillStyle = "#ffffff";
      pg.fillRect(0, 0, W, H);
      pg.setTransform(k, 0, 0, k, ox, oy);
      pg.translate(l.cx, l.cy);
      pg.rotate((l.rotation * Math.PI) / 180);
      pg.imageSmoothingQuality = "high";
      pg.drawImage(l.source, -ib.rawW / 2, -ib.rawH / 2, ib.rawW, ib.rawH);
      pg.setTransform(1, 0, 0, 1, 0, 0);
      applyBinarizationToCanvas(pg, l.crisp ? "threshold" : $("binarizeMode").value);
      // Zona que ocupa la imagen (tapa lo de debajo).
      const mg = scratch();
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, W, H);
      mg.setTransform(k, 0, 0, k, ox, oy);
      mg.translate(l.cx, l.cy);
      mg.rotate((l.rotation * Math.PI) / 180);
      mg.fillStyle = "#000000";
      mg.fillRect(-ib.rawW / 2, -ib.rawH / 2, ib.rawW, ib.rawH);
      mg.setTransform(1, 0, 0, 1, 0, 0);
      const md = mg.getImageData(0, 0, W, H).data;
      const pd = pg.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) {
        if (md[i + 3] > 127) {
          d[i] = d[i + 1] = d[i + 2] = pd[i];
          d[i + 3] = 255;
        }
      }
    } else {
      const layout = withTextLayer(l, getTextLayout);
      if (!layout) continue;
      const tg2 = scratch();
      tg2.setTransform(1, 0, 0, 1, 0, 0);
      tg2.clearRect(0, 0, W, H);
      tg2.setTransform(k, 0, 0, k, ox, oy);
      withTextLayer(l, () => drawTextLayer(tg2, layout, k));
      tg2.setTransform(1, 0, 0, 1, 0, 0);
      const td = tg2.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) {
        if (td[i + 3] > 110) {
          d[i] = d[i + 1] = d[i + 2] = 0;
          d[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(out, 0, 0);
}

// Dibuja el texto en g. k = ampliación (el mural lo dibuja más grande y nítido
// con g ya escalado; la etiqueta normal usa k = 1).
function drawTextLayer(g, layout, k = 1) {
  g.fillStyle = "#000000";
  g.font = `bold ${layout.fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  g.textBaseline = "top";
  g.textAlign = textLayer.align;

  const drawX =
    textLayer.align === "center"
      ? textLayer.cx
      : textLayer.align === "left"
      ? layout.x
      : layout.x + layout.w;

  let y = Math.max(2, layout.y + 2);
  if (layout.rotation) {
    drawRotatedText(layout, g, k);
  } else if (layout.listMode) {
    drawListItems(g, layout, y);
  } else {
    for (const line of layout.lines) {
      g.fillText(line, drawX, y);
      y += layout.lineHeight;
    }
  }
}

// Texto girado: se dibuja el bloque sin girar en un lienzo aparte y se pega girado.
function drawRotatedText(layout, dest = tctx, k = 1) {
  const bw = Math.max(1, Math.ceil(layout.width) + 4);
  const bh = Math.max(1, Math.ceil(layout.height) + 4);
  const block = document.createElement("canvas");
  block.width = Math.ceil(bw * k);
  block.height = Math.ceil(bh * k);
  const g = block.getContext("2d");
  if (k !== 1) g.scale(k, k);
  g.fillStyle = "#000000";
  g.strokeStyle = "#000000";
  g.textBaseline = "top";
  if (layout.listMode) {
    drawListItems(g, { lines: layout.lines, x: 0, w: layout.width }, 2);
  } else {
    g.font = fontFor(layout.fontSize);
    g.textAlign = textLayer.align;
    const x = textLayer.align === "center" ? layout.width / 2 : textLayer.align === "left" ? 0 : layout.width;
    let y = 2;
    for (const line of layout.lines) {
      g.fillText(line, x, y);
      y += layout.lineHeight;
    }
  }
  dest.save();
  dest.translate(textLayer.cx, textLayer.cy);
  dest.rotate((layout.rotation * Math.PI) / 180);
  if (k === 1) dest.drawImage(block, -bw / 2, -bh / 2);
  else dest.drawImage(block, -bw / 2, -bh / 2, bw, bh);
  dest.restore();
}

function drawListItems(tctx, layout, startY) {
  let y = startY;
  tctx.textAlign = "left";
  tctx.textBaseline = "top";
  for (const it of layout.lines) {
    if (it.kind === "title") {
      tctx.font = fontFor(it.size);
      tctx.textAlign = "center";
      tctx.fillText(it.text, layout.x + layout.w / 2, y);
      tctx.textAlign = "left";
    } else if (it.kind === "item" || it.kind === "cont") {
      tctx.font = fontFor(it.size);
      if (it.kind === "item") {
        const lw = Math.max(2, Math.round(it.size / 12));
        const bx = layout.x + lw / 2;
        const by = y + Math.round((it.h - it.box) / 2) - 1;
        tctx.lineWidth = lw;
        tctx.strokeStyle = "#000000";
        tctx.strokeRect(bx, by, it.box - lw, it.box - lw);
        if (it.checked) {
          tctx.beginPath();
          tctx.moveTo(bx + it.box * 0.18, by + it.box * 0.5);
          tctx.lineTo(bx + it.box * 0.42, by + it.box * 0.74);
          tctx.lineTo(bx + it.box * 0.82, by + it.box * 0.2);
          tctx.lineWidth = lw + 1;
          tctx.lineCap = "round";
          tctx.stroke();
        }
      }
      tctx.fillText(it.text, layout.x + it.indent, y);
    }
    y += it.h;
  }
}

// --- Arrastre con ratón / dedo ---
function getCanvasCoords(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) * canvas.width) / rect.width,
    y: ((ev.clientY - rect.top) * canvas.height) / rect.height
  };
}

// Pellizcar con dos dedos: cambia el tamaño de lo elegido (texto o dibujo),
// igual que mover su barra de tamaño.
const pinch = { pts: new Map(), active: false, dist: 0, start: 0, input: null, prev: null };
function pinchDistance() {
  const [a, b] = [...pinch.pts.values()];
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}
function pinchDown(ev) {
  if (ev.pointerType !== "touch") return;
  pinch.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  // El primer dedo puede caer fuera del texto o dibujo y quitar la selección:
  // se recuerda lo que estaba elegido antes para pellizcar sobre eso.
  if (pinch.pts.size === 1) {
    pinch.prev = state.selectedLayer === "text" ? textLayer : state.selectedLayer === "image" ? imgLayer : null;
    return;
  }
  if (pinch.pts.size !== 2) return;
  if (!state.selectedLayer && pinch.prev) {
    selectLayer(pinch.prev);
    drawOverlay();
  }
  if (!state.selectedLayer) return;
  const input = $(state.selectedLayer === "text" ? "fontSize" : "imgScale");
  state.drag.active = false;
  pinch.active = true;
  pinch.input = input;
  pinch.dist = pinchDistance();
  pinch.start = Number(input.value);
}
function pinchMove(ev) {
  if (!pinch.pts.has(ev.pointerId)) return false;
  pinch.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!pinch.active) return false;
  const inp = pinch.input;
  const v = Math.round(Math.max(Number(inp.min), Math.min(Number(inp.max), pinch.start * (pinchDistance() / pinch.dist))));
  if (String(v) !== inp.value) {
    inp.value = String(v);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}
function pinchUp(ev) {
  pinch.pts.delete(ev.pointerId);
  if (pinch.active && pinch.pts.size < 2) {
    pinch.active = false;
    if (pinch.input) pinch.input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

canvas.addEventListener("pointerdown", (ev) => {
  pinchDown(ev);
  if (pinch.active || pinch.pts.size > 1) return;
  const { x, y } = getCanvasCoords(ev);
  const hit = hitTest(x, y);
  selectLayer(hit);

  if (!hit) {
    drawOverlay();
    return;
  }

  const targetObj = hit;
  state.drag = {
    active: true,
    layer: hit,
    startX: x,
    startY: y,
    origX: targetObj.cx,
    origY: targetObj.cy
  };
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(ev.pointerId);
  drawOverlay();
});

canvas.addEventListener("pointermove", (ev) => {
  if (pinchMove(ev)) return;
  const { x, y } = getCanvasCoords(ev);

  if (state.drag.active) {
    const targetObj = state.drag.layer;
    targetObj.cx = state.drag.origX + (x - state.drag.startX);
    targetObj.cy = state.drag.origY + (y - state.drag.startY);
    renderScene();
    return;
  }

  const hit = hitTest(x, y);
  if (hit !== state.hoverLayer) {
    state.hoverLayer = hit;
    canvas.style.cursor = hit ? "grab" : "default";
    drawOverlay();
  }
});

function stopDragging(ev) {
  if (ev.type !== "pointerleave") pinchUp(ev);
  if (!state.drag.active) return;
  state.drag.active = false;
  if (ev.pointerId !== undefined && canvas.hasPointerCapture(ev.pointerId)) {
    canvas.releasePointerCapture(ev.pointerId);
  }
  canvas.style.cursor = state.hoverLayer ? "grab" : "default";
  drawOverlay();
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("pointerleave", () => {
  if (!state.drag.active) {
    state.hoverLayer = null;
    canvas.style.cursor = "default";
    drawOverlay();
  }
});

canvas.addEventListener(
  "wheel",
  (ev) => {
    if (!imgLayer.source) return;
    ev.preventDefault();
    const delta = ev.deltaY < 0 ? 5 : -5;
    const next = Math.max(15, Math.min(220, Math.round(imgLayer.zoom * 100) + delta));
    imgLayer.zoom = next / 100;
    $("imgScale").value = String(next);
    $("imgScaleVal").textContent = `${next}%`;
    renderScene();
  },
  { passive: false }
);

// --- Sellos rápidos para niños e imagen ---
function loadImageSource(srcObj, { crisp = false, name = "", gallery = false } = {}) {
  if (groupFull(gallery ? "gallery" : "image")) return false;
  // Cada imagen nueva es una capa más (si la actual está vacía se aprovecha).
  if (imgLayer.source) imgLayer = newImageLayer();
  imgLayer.crisp = crisp;
  imgLayer.name = name;
  imgLayer.gallery = gallery;
  const h = getCanvasTargetHeight();
  const area = getPrintArea();
  const fit = Math.min(area.w / srcObj.width, h / srcObj.height) * 0.85;
  imgLayer.source = srcObj;
  imgLayer.baseScale = fit;
  imgLayer.zoom = 1;
  imgLayer.rotation = 0;
  imgLayer.cx = area.cx;
  imgLayer.cy = h / 2;
  $("imgScale").value = "100";
  $("imgScaleVal").textContent = "100%";
  state.selectedLayer = "image";
  renderScene();
  return true;
}

function createStamp(kind) {
  const size = 200;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "#000000";
  g.fillStyle = "#000000";
  g.lineWidth = 8;
  g.lineCap = "round";
  g.lineJoin = "round";

  if (kind === "star") {
    const cx = 100, cy = 104, outer = 78, inner = 34;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(85, 96, 6, 0, Math.PI * 2);
    g.arc(115, 96, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(100, 108, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else if (kind === "smile") {
    g.beginPath();
    g.arc(100, 100, 78, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(72, 82, 9, 0, Math.PI * 2);
    g.arc(128, 82, 9, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(100, 104, 42, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else if (kind === "rocket") {
    g.beginPath();
    g.moveTo(100, 20);
    g.quadraticCurveTo(148, 65, 134, 140);
    g.lineTo(66, 140);
    g.quadraticCurveTo(52, 65, 100, 20);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(100, 82, 18, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(68, 112);
    g.lineTo(38, 148);
    g.lineTo(66, 140);
    g.moveTo(132, 112);
    g.lineTo(162, 148);
    g.lineTo(134, 140);
    g.stroke();
    g.beginPath();
    g.moveTo(82, 142);
    g.lineTo(100, 182);
    g.lineTo(118, 142);
    g.stroke();
  }

  loadImageSource(c, { name: { star: "Estrella", rocket: "Cohete", smile: "Carita" }[kind] || "Dibujo" });
  imgLayer.original = null;
}

$("btnPickFile").addEventListener("click", () => $("fileInput").click());
$("btnStampStar").addEventListener("click", () => createStamp("star"));
$("btnStampRocket").addEventListener("click", () => createStamp("rocket"));
$("btnStampSmile").addEventListener("click", () => createStamp("smile"));

// --- Ajuste automático de fotos ---
// Prepara una versión en grises pensada para papel térmico de 1 bit:
//  1. Estira niveles (percentiles 0,5–99,5).
//  2. Contraste local: separa cada zona de su entorno para que no se pierda
//     el detalle en sombras y luces (lo más importante en térmica).
//  3. Corrige la exposición dejando la media algo clara (el térmico oscurece).
//  4. Realza bordes al tamaño real de impresión.
// Se trabaja a 2× el tamaño impreso para que el realce no se pierda al reducir.
// También decide si es foto o dibujo.

function boxBlur(src, w, h, r) {
  // Desenfoque de caja con imagen integral: O(n) sea cual sea el radio.
  const W = w + 1;
  const integ = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

function analyzeAndEnhance(src, strength = 0.7, printedMaxSide = 400) {
  const target = Math.max(300, Math.min(1400, Math.round(printedMaxSide * 2)));
  const scale = Math.min(1, target / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  let lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    // Transparente = blanco
    const l = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a + 255 * (1 - a);
    lum[i] = l;
    hist[Math.min(255, Math.max(0, Math.round(l)))]++;
  }

  // ¿Dibujo o foto? Un dibujo tiene casi todo en blanco/negro puros.
  let extremes = 0;
  for (let v = 0; v < 256; v++) if (v < 40 || v > 215) extremes += hist[v];
  const isDrawing = extremes / n > 0.85;
  if (isDrawing) {
    return { canvas: src, isDrawing, info: "Dibujo detectado: modo nítido, sin retoques." };
  }

  const pct = (p) => {
    const t = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= t) return v;
    }
    return 255;
  };
  const lo = pct(0.005);
  const hi = Math.max(lo + 1, pct(0.995));

  // 1. Niveles
  for (let i = 0; i < n; i++) lum[i] = Math.max(0, Math.min(1, (lum[i] - lo) / (hi - lo)));

  // 2. Contraste local (radio grande ≈ 1/10 de la foto)
  const R = Math.max(4, Math.round(Math.max(w, h) / 10));
  const big = boxBlur(lum, w, h, R);
  const kLocal = 1.4 * strength;
  for (let i = 0; i < n; i++) lum[i] = Math.max(0, Math.min(1, lum[i] + kLocal * (lum[i] - big[i])));

  // 3. Exposición: media → 0.6
  let sum = 0;
  for (let i = 0; i < n; i++) sum += lum[i];
  const mean = sum / n;
  const gammaFull = Math.log(0.6) / Math.log(Math.max(0.02, Math.min(0.98, mean)));
  const gamma = Math.max(0.45, Math.min(2, 1 + (gammaFull - 1) * Math.min(1, 0.4 + strength)));
  for (let i = 0; i < n; i++) lum[i] = Math.pow(lum[i], gamma);

  // 4. Realce de bordes (radio 1 al tamaño de trabajo)
  const small = boxBlur(lum, w, h, 1);
  const kSharp = 1.8 * strength;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, lum[i] + kSharp * (lum[i] - small[i]))) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const info = `Foto mejorada (${Math.round(strength * 100)} %): niveles ${lo}–${hi}, contraste local, exposición ${gamma < 0.97 ? "aclarada" : gamma > 1.03 ? "oscurecida" : "correcta"} y bordes realzados.`;
  return { canvas: c, isDrawing, info };
}

// Cambia la imagen usada manteniendo el tamaño en pantalla.
function swapImageSource(next) {
  const prev = imgLayer.source;
  if (prev && prev.width && next.width) {
    imgLayer.baseScale = (imgLayer.baseScale * prev.width) / next.width;
  }
  imgLayer.source = next;
}

$("fileInput").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    $("fileInput").value = "";
    if (!loadImageSource(img, { name: file.name })) return;
    imgLayer.original = img;
    log(`Imagen cargada: ${file.name} (${img.width}×${img.height} px).`);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    log("ERROR: No se pudo cargar la imagen.");
  };
  img.src = url;
});

$("imgScale").addEventListener("input", () => {
  const val = Number($("imgScale").value);
  $("imgScaleVal").textContent = `${val}%`;
  imgLayer.zoom = val / 100;
  renderScene();
});

$("btnRotateImg").addEventListener("click", () => {
  if (!imgLayer.source) return;
  imgLayer.rotation = (imgLayer.rotation + 90) % 360;
  renderScene();
});

$("btnCenterImg").addEventListener("click", () => {
  if (!imgLayer.source) return;
  imgLayer.cx = getPrintArea().cx;
  imgLayer.cy = canvas.height / 2;
  renderScene();
});

// Quita una capa; la selección pasa a otra del mismo tipo (o a una vacía).
function removeLayer(l) {
  if (!l) return;
  layers = layers.filter((x) => x !== l);
  if (l.kind === "image") {
    l.source = null;
    l.original = null;
    $("fileInput").value = "";
    if (l === imgLayer) {
      const other = [...layers].reverse().find((x) => x.kind === "image");
      imgLayer = other || newImageLayer();
      if (other) selectLayer(other);
      else if (state.selectedLayer === "image") state.selectedLayer = null;
    }
  } else {
    l.text = "";
    if (l === textLayer) {
      const other = [...layers].reverse().find((x) => x.kind === "text");
      if (other) selectLayer(other);
      else {
        textLayer = newTextLayer();
        $("textInput").value = "";
        $("textRotVal").textContent = "0°";
        if (state.selectedLayer === "text") state.selectedLayer = null;
      }
    }
  }
  renderScene();
}

$("btnClearImg").addEventListener("click", () => removeLayer(imgLayer.source ? imgLayer : null));

["binarizeMode", "brightness", "contrast"].forEach((id) => {
  $(id).addEventListener("input", () => {
    updateRangeLabels();
    renderScene();
  });
});
["density", "marginY"].forEach((id) => $(id).addEventListener("input", updateRangeLabels));
$("density").addEventListener("input", updateDensityPreview);

// Valores al lado de los deslizadores (brillo, contraste, intensidad, margen).
function updateRangeLabels() {
  const sign = (v) => (Number(v) > 0 ? `+${v}` : String(v));
  $("brightnessVal").textContent = sign($("brightness").value);
  $("contrastVal").textContent = sign($("contrast").value);
  $("densityVal").textContent = $("density").value;
  const my = Number($("marginY").value) || 0;
  $("marginYVal").textContent = `${(my / DOTS_PER_MM).toFixed(1).replace(".", ",")} mm`;
}

// Como mucho 2 textos, 2 fotos o dibujos y 2 cosas de la Galería (así caben
// las listas sin que la página tenga que desplazarse).
const MAX_PER_GROUP = 2;
const GROUP_LABEL = { text: "textos", image: "fotos o dibujos", gallery: "elementos de la Galería" };
function layerGroup(l) {
  return l.kind === "text" ? "text" : l.gallery ? "gallery" : "image";
}
function groupCount(g) {
  syncLayers();
  return layers.filter((l) => layerGroup(l) === g).length;
}
function groupFull(g, quiet = false) {
  if (groupCount(g) < MAX_PER_GROUP) return false;
  if (!quiet) toast(`Como mucho ${MAX_PER_GROUP} ${GROUP_LABEL[g]}. Quita uno con × para poner otro.`, "warn", 6000);
  return true;
}

// Debajo de Texto, «Dibujo o foto» y Galería: una línea por elemento, para
// elegir cuál se edita (clic), ordenarlo (≡) o quitarlo (×).
const elistKeys = {};
function renderElementList(boxId, group) {
  const box = $(boxId);
  const items = [...layers].reverse().filter((l) => layerGroup(l) === group);
  const current = group === "text" ? textLayer : imgLayer;
  const key = JSON.stringify([items.map((l) => [l.id, layerName(l)]), current.id]);
  if (elistKeys[boxId] === key) return;
  elistKeys[boxId] = key;
  box.textContent = "";
  for (const l of items) {
    const r = document.createElement("div");
    r.className = "layer-row" + (l === current && items.length > 1 ? " sel" : "");
    r.title = "Clic para editarlo";
    const grip = document.createElement("span");
    grip.className = items.length > 1 ? "grip i-grip" : "grip none";
    if (items.length > 1) grip.title = "Arrastra para ponerlo encima o debajo";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layerName(l);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "btn-soft icon-btn i i-x";
    x.title = "Quitar";
    x.setAttribute("aria-label", `Quitar ${layerName(l)}`);
    x.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removeLayer(l);
    });
    r.append(grip, name, x);
    r.addEventListener("click", () => {
      selectLayer(l);
      renderScene();
    });
    grip.addEventListener("pointerdown", () => (r.draggable = true));
    r.addEventListener("dragstart", (ev) => {
      elistDrag = l;
      r.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", String(l.id));
    });
    r.addEventListener("dragend", () => {
      r.draggable = false;
      r.classList.remove("dragging");
      box.querySelectorAll(".drop-before,.drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after"));
      elistDrag = null;
    });
    r.addEventListener("dragover", (ev) => {
      if (!elistDrag || layerGroup(elistDrag) !== group) return;
      ev.preventDefault();
      const after = ev.offsetY > r.clientHeight / 2;
      r.classList.toggle("drop-after", after);
      r.classList.toggle("drop-before", !after);
    });
    r.addEventListener("dragleave", () => r.classList.remove("drop-before", "drop-after"));
    r.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const moved = elistDrag;
      if (!moved || moved === l) return;
      // La lista va de arriba abajo; «layers» de abajo arriba.
      const below = ev.offsetY > r.clientHeight / 2;
      layers = layers.filter((x) => x !== moved);
      const ti = layers.indexOf(l);
      layers.splice(below ? ti : ti + 1, 0, moved);
      renderScene();
    });
    box.appendChild(r);
  }
}
let elistDrag = null;

function updateLayerChips() {
  syncLayers();
  renderElementList("textList", "text");
  renderElementList("imgList", "image");
  renderElementList("galList", "gallery");
  const nt = groupCount("text");
  const ni = groupCount("image");
  $("textCount").textContent = nt > 1 ? `${nt}/${MAX_PER_GROUP}` : "";
  $("imgCount").textContent = ni > 1 ? `${ni}/${MAX_PER_GROUP}` : "";
  const ng = groupCount("gallery");
  $("galCount").textContent = ng > 1 ? `${ng}/${MAX_PER_GROUP}` : "";
  const full = (n, what) => (n >= MAX_PER_GROUP ? `Ya hay ${MAX_PER_GROUP} ${what} (el máximo). Quita uno con × para poner otro.` : "");
  $("textCount").title = full(nt, "textos");
  $("imgCount").title = full(ni, "fotos o dibujos");
  $("galCount").title = full(ng, "elementos de la Galería");
  $("btnNewText").title = nt >= MAX_PER_GROUP ? `Ya hay ${MAX_PER_GROUP} textos (el máximo)` : "Añadir otro texto (se mueve por separado)";
  const f = typeof FRAMES !== "undefined" ? FRAMES.find((x) => x.id === frameLayer.style) : null;
  $("galFrameChip").hidden = !f;
  $("galFrameChipName").textContent = f ? `Marco: ${f.name}` : "";
  $("frameScaleRow").hidden = !f;
  $("frameScale").value = String(frameLayer.scale || 100);
  $("frameScaleVal").textContent = `${frameLayer.scale || 100}%`;
  renderLayersList();
}

// --- Lista de capas (textos e imágenes), de arriba abajo como se ven ---
function layerName(l) {
  if (l.kind === "text") return expandTokens(l.text).split(/\r?\n/).find((x) => x.trim()) || "Texto";
  return l.name || "Imagen";
}

let layersKey = "";
function renderLayersList(force = false) {
  const btn = $("btnLayers");
  const pop = $("layersPop");
  const inMural = typeof muralActive === "function" && muralActive();
  btn.hidden = inMural;
  if (inMural && !pop.hidden) closeLayers();
  $("layersCount").textContent = String(layers.length + (frameLayer.style ? 1 : 0));
  if (pop.hidden) return;
  const sel = state.selectedLayer === "text" ? textLayer : state.selectedLayer === "image" ? imgLayer : null;
  const key = JSON.stringify([layers.map((l) => [l.id, layerName(l)]), sel && sel.id, frameLayer.style]);
  if (!force && key === layersKey) return;
  layersKey = key;
  pop.textContent = "";
  const head = document.createElement("div");
  head.className = "lp-head";
  head.textContent = "Arriba lo que tapa a lo de abajo. Arrastra ≡ para ordenar.";
  pop.appendChild(head);
  const row = (l, label, kindTxt, onX, draggable) => {
    const r = document.createElement("div");
    r.className = "layer-row" + (l && l === sel ? " sel" : "");
    const grip = document.createElement("span");
    grip.className = draggable ? "grip i-grip" : "grip none";
    grip.title = draggable ? "Arrastra para subir o bajar" : "";
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = kindTxt;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = label;
    name.title = label;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "btn-soft icon-btn i i-x";
    x.title = "Quitar";
    x.setAttribute("aria-label", `Quitar ${label}`);
    x.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onX();
      renderLayersList(true);
    });
    r.append(grip, kind, name, x);
    return r;
  };
  if (frameLayer.style) {
    const f = typeof FRAMES !== "undefined" ? FRAMES.find((x) => x.id === frameLayer.style) : null;
    pop.appendChild(row(null, f ? f.name : "Marco", "MARCO", () => $("galFrameChipX").click(), false));
  }
  const shown = [...layers].reverse();
  shown.forEach((l, di) => {
    const r = row(l, layerName(l), l.kind === "text" ? "TEXTO" : l.gallery ? "GALERÍA" : "IMAGEN", () => removeLayer(l), true);
    r.dataset.idx = String(di);
    r.addEventListener("click", () => {
      selectLayer(l);
      renderScene();
      renderLayersList(true);
    });
    // Solo se arrastra cogiendo las tres rayas.
    const grip = r.querySelector(".grip");
    grip.addEventListener("pointerdown", () => (r.draggable = true));
    r.addEventListener("dragstart", (ev) => {
      r.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", String(di));
    });
    r.addEventListener("dragend", () => {
      r.draggable = false;
      r.classList.remove("dragging");
      pop.querySelectorAll(".drop-before,.drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after"));
    });
    r.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      const after = ev.offsetY > r.clientHeight / 2;
      r.classList.toggle("drop-after", after);
      r.classList.toggle("drop-before", !after);
    });
    r.addEventListener("dragleave", () => r.classList.remove("drop-before", "drop-after"));
    r.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const from = Number(ev.dataTransfer.getData("text/plain"));
      let to = di + (ev.offsetY > r.clientHeight / 2 ? 1 : 0);
      if (Number.isNaN(from)) return;
      const list = [...layers].reverse();
      const [moved] = list.splice(from, 1);
      if (to > from) to--;
      list.splice(to, 0, moved);
      layers = list.reverse();
      renderScene();
      renderLayersList(true);
    });
    pop.appendChild(r);
  });
  if (!layers.length && !frameLayer.style) {
    const e = document.createElement("div");
    e.className = "lp-empty";
    e.textContent = "Aún no hay nada: escribe un texto o pon una foto o algo de la Galería.";
    pop.appendChild(e);
  }
}

function closeLayers() {
  $("layersPop").hidden = true;
  $("btnLayers").setAttribute("aria-expanded", "false");
}
$("btnLayers").addEventListener("click", (ev) => {
  ev.stopPropagation();
  const pop = $("layersPop");
  if (!pop.hidden) return closeLayers();
  pop.hidden = false;
  $("btnLayers").setAttribute("aria-expanded", "true");
  renderLayersList(true);
});
document.addEventListener("pointerdown", (ev) => {
  const pop = $("layersPop");
  if (pop.hidden || pop.contains(ev.target) || ev.target === $("btnLayers") || ev.target === canvas) return;
  closeLayers();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !$("layersPop").hidden) closeLayers();
});

$("frameScale").addEventListener("input", () => {
  frameLayer.scale = Number($("frameScale").value) || 100;
  $("frameScaleVal").textContent = `${frameLayer.scale}%`;
  renderScene();
});

$("galFrameChipX").addEventListener("click", () => {
  frameLayer.style = null;
  frameLayer.scale = 100;
  if (typeof updateFrameInfo === "function") updateFrameInfo();
  renderScene();
});

$("textInput").addEventListener("input", () => {
  const hadText = Boolean(textLayer.text.trim());
  textLayer.text = $("textInput").value;
  if (!hadText && textLayer.text.trim() && !textLayer.placed) {
    textLayer.cx = getPrintArea().cx;
    textLayer.cy = canvas.height / 2;
    state.selectedLayer = "text";
  }
  renderScene();
});

$("fontSize").addEventListener("input", () => {
  const val = Math.max(14, Number($("fontSize").value) || 30);
  $("fontSizeVal").textContent = String(val);
  textLayer.fontSize = val;
  renderScene();
});

$("chkListMode").addEventListener("change", () => {
  if ($("chkListMode").checked) $("chkPerLine").checked = false;
  saveSettings();
  renderScene();
});

$("btnShopList").addEventListener("click", () => {
  $("chkListMode").checked = true;
  if (!$("textInput").value.trim()) {
    const d = new Date();
    const fecha = `${d.getDate()}/${d.getMonth() + 1}`;
    $("textInput").value = `# Compra ${fecha}\nLeche\nPan\nHuevos\nFruta`;
    textLayer.text = $("textInput").value;
  }
  saveSettings();
  const p = getProfile($("paperProfile").value);
  if (!p || p.type !== "continuous") {
    toast("Para listas largas elige «Rollo continuo» en Papel (si es el rollo que tienes puesto).", "info", 7000);
  }
  textLayer.cx = getPrintArea().cx;
  textLayer.cy = 0;
  state.selectedLayer = "text";
  renderScene();
  $("textInput").focus();
});

$("btnRotateText").addEventListener("click", () => {
  textLayer.rotation = (textLayer.rotation + 90) % 360;
  $("textRotVal").textContent = `${textLayer.rotation}°`;
  const area = getPrintArea();
  textLayer.cx = area.cx;
  textLayer.cy = getCanvasTargetHeight() / 2;
  state.selectedLayer = "text";
  renderScene();
});

$("textAlign").addEventListener("change", () => {
  textLayer.align = $("textAlign").value;
  // Además de alinear las líneas entre sí, se lleva el bloque de texto a ese lado
  // de la etiqueta (getTextLayout lo deja dentro del margen).
  const area = getPrintArea();
  textLayer.cx = textLayer.align === "left" ? area.x0 : textLayer.align === "right" ? area.x1 : area.cx;
  state.selectedLayer = "text";
  renderScene();
});

$("btnCenterText").addEventListener("click", () => {
  textLayer.cx = getPrintArea().cx;
  textLayer.cy = canvas.height / 2;
  renderScene();
});

$("btnClearText").addEventListener("click", () => {
  if (textLayer.text.trim()) removeLayer(textLayer);
  else {
    $("textInput").value = "";
    textLayer.text = "";
    renderScene();
  }
});

// «+ Texto»: otro texto aparte, que se mueve por su cuenta.
$("btnNewText").addEventListener("click", () => {
  if (typeof muralActive === "function" && muralActive()) return;
  syncLayers();
  if (textLayer.text.trim()) {
    if (groupFull("text")) return;
    // El texto nuevo va al hueco más libre (arriba, centro o abajo).
    const H = canvas.height;
    const used = layers.filter((l) => l.kind === "text").map((l) => l.cy);
    const slots = [H / 2, H * 0.22, H * 0.78];
    const far = (y) => Math.min(...used.map((u) => Math.abs(u - y)));
    const t = newTextLayer();
    t.cy = slots.reduce((a, b) => (far(b) > far(a) + 1 ? b : a));
    t.placed = true;
    textLayer = t;
  }
  $("textInput").value = "";
  $("textRotVal").textContent = `${textLayer.rotation}°`;
  state.selectedLayer = "text";
  renderScene();
  $("textInput").focus();
});

function refitImageToPaper() {
  const h = getCanvasTargetHeight();
  const area = getPrintArea();
  const imgs = layers.filter((l) => l.kind === "image");
  if (imgLayer.source && !imgs.includes(imgLayer)) imgs.push(imgLayer);
  for (const l of imgs) {
    if (!l.source) continue;
    l.baseScale = Math.min(area.w / l.source.width, h / l.source.height) * 0.85;
    l.cx = area.cx;
    l.cy = h / 2;
  }
}

function updatePaperInfo() {
  const p = getProfile($("paperProfile").value);
  const isLabel = $("paperMode").value === "label";
  const w = getPaperWidthMm();
  const h = Number($("labelHeightMm").value) || 30;
  $("paperPill").textContent = isLabel
    ? `${isRoundPaper() ? `Ø${w}` : `${w}×${h}`} mm`
    : `Continuo ${w} mm`;
  $("paperUse").textContent = p ? p.use : "";
  $("paperProfile").title = p ? p.use : "";
  // Las medidas a mano solo se ven con «Personalizado» (si no, las pone el tipo de papel).
  $("customPaper").hidden = !(p && p.id === "custom");
  const q = buySearchQuery(p);
  $("buyLink").href = `https://www.amazon.es/s?k=${encodeURIComponent(q)}`;
  $("buyLink").textContent = `🔎 Buscar «${p && p.id !== "custom" ? p.name : "papel térmico"}» en Amazon`;
  document.querySelectorAll("[data-buy]").forEach((el) => {
    el.classList.toggle("active", el.dataset.buy === (p && p.type === "continuous" ? "continuous" : "label"));
  });
}

// Aplica un tipo de papel: rellena los ajustes avanzados y adapta textos y dibujos.
function applyPaperProfile(id, { adaptContent = true } = {}) {
  const p = getProfile(id);
  if (!p || p.id === "custom") {
    updatePaperInfo();
    renderScene();
    return;
  }
  const oldH = Number($("labelHeightMm").value) || 30;
  $("paperMode").value = p.type;
  $("paperWidthMm").value = String(p.w);
  if (p.type === "label") {
    $("labelHeightMm").value = String(p.h);
    $("gapMm").value = String(p.gap);
  } else {
    $("chkSendGap").checked = false;
  }
  $("labelHeightWrap").style.display = p.type === "label" ? "inline-flex" : "none";

  if (adaptContent && p.type === "label") {
    // El tamaño de letra sigue al alto de la etiqueta (30 mm → 30, como hasta ahora).
    const ratio = p.h / oldH;
    const texts = layers.filter((l) => l.kind === "text");
    if (!texts.includes(textLayer)) texts.push(textLayer);
    for (const t of texts) t.fontSize = Math.max(14, Math.min(80, Math.round(t.fontSize * ratio)));
    const next = textLayer.fontSize;
    $("fontSize").value = String(next);
    $("fontSizeVal").textContent = String(next);
  }
  if (adaptContent) {
    for (const t of layers) if (t.kind === "text") t.cx = getPrintArea().cx;
    textLayer.cx = getPrintArea().cx;
    refitImageToPaper();
  }
  saveSettings();
  updatePaperInfo();
  renderScene();
}

function findProfileFor(type, w, h) {
  const candidates = PAPER_PROFILES.filter(
    (p) => p.type === type && !p.round && (type === "continuous" || (p.h === h && Math.abs(p.w - w) <= 4))
  );
  candidates.sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w));
  return candidates[0];
}

// --- Mis papeles (favoritos) ---
// Se guardan en el navegador: ids de papeles de la lista marcados con ⭐ y
// papeles propios (con nombre y nota, p. ej. dónde se compraron).
const FAV_KEY = "pm270.favPapers.v1";

function loadFavs() {
  try {
    const data = JSON.parse(localStorage.getItem(FAV_KEY) || "null");
    if (data && Array.isArray(data.ids) && Array.isArray(data.custom)) return data;
  } catch {}
  return { ids: [], custom: [] };
}

function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {}
}

// Los papeles propios se añaden a la lista general para que todo lo demás funcione igual.
function registerCustomProfiles() {
  for (let i = PAPER_PROFILES.length - 1; i >= 0; i--) {
    if (PAPER_PROFILES[i].userDefined) PAPER_PROFILES.splice(i, 1);
  }
  const customIdx = PAPER_PROFILES.findIndex((p) => p.id === "custom");
  for (const c of loadFavs().custom) {
    PAPER_PROFILES.splice(customIdx, 0, { ...c, userDefined: true, use: c.note ? `Mi papel: ${c.note}` : "Mi papel guardado." });
  }
}

function isFavorite(id) {
  const favs = loadFavs();
  return favs.ids.includes(id) || favs.custom.some((c) => c.id === id);
}

// Elige un papel en la lista; si estaba escondido por «Solo mis papeles», se rehace la lista.
function setProfileValue(id) {
  const sel = $("paperProfile");
  if (![...sel.options].some((o) => o.value === id)) populatePaperProfiles(id);
  sel.value = id;
  updateFavButton();
}

function populatePaperProfiles(wanted) {
  registerCustomProfiles();
  const sel = $("paperProfile");
  const prev = wanted || sel.value;
  sel.innerHTML = "";
  const favs = loadFavs();
  const favProfiles = PAPER_PROFILES.filter((p) => p.userDefined || favs.ids.includes(p.id));
  const onlyFavs = $("chkOnlyFavs").checked && favProfiles.length > 0;
  if (favProfiles.length) {
    const og = document.createElement("optgroup");
    og.label = "★ Mis papeles";
    for (const p of favProfiles) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `★ ${p.name}`;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  const current = prev || "l54x30";
  for (const group of PROFILE_GROUPS) {
    if (onlyFavs) {
      // Con «Solo mis papeles» se esconde el resto, salvo el que esté elegido ahora.
      const cur = getProfile(current);
      if (!(cur && group.match(cur) && !favProfiles.includes(cur))) continue;
    }
    const og = document.createElement("optgroup");
    og.label = group.label;
    for (const p of PAPER_PROFILES.filter((x) => group.match(x) && !x.userDefined && !favs.ids.includes(x.id))) {
      if (onlyFavs && p.id !== current) continue;
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      og.appendChild(opt);
    }
    if (og.children.length) sel.appendChild(og);
  }
  sel.value = getProfile(current) ? current : "l54x30";
  if (!sel.value) sel.value = "custom";
  updateFavButton();
}

function updateFavButton() {
  const id = $("paperProfile").value;
  const fav = isFavorite(id);
  const b = $("btnFavPaper");
  b.textContent = "";
  b.title = id === "custom"
    ? "Guardar estos valores como uno de mis papeles"
    : fav
    ? "Quitar de mis papeles"
    : "Añadir a mis papeles";
  b.classList.toggle("fav-on", fav);
}

function askFavName(defaultName) {
  return new Promise((resolve) => {
    const dlg = $("favDialog");
    $("favName").value = defaultName;
    $("favNote").value = "";
    const done = (ok) => {
      dlg.close();
      $("favOk").onclick = null;
      $("favCancel").onclick = null;
      resolve(ok ? { name: $("favName").value.trim() || defaultName, note: $("favNote").value.trim() } : null);
    };
    $("favOk").onclick = () => done(true);
    $("favCancel").onclick = () => done(false);
    dlg.oncancel = (ev) => {
      ev.preventDefault();
      done(false);
    };
    dlg.showModal();
    $("favName").select();
  });
}

$("btnFavPaper").addEventListener("click", async () => {
  const id = $("paperProfile").value;
  const favs = loadFavs();
  const p = getProfile(id);
  if (id === "custom") {
    const isLabel = $("paperMode").value === "label";
    const w = getPaperWidthMm();
    const h = Number($("labelHeightMm").value) || 30;
    const res = await askFavName(isLabel ? `Etiqueta ${w}×${h} mm` : `Continuo ${w} mm`);
    if (!res) return;
    const entry = {
      id: `fav_${Date.now().toString(36)}`,
      name: res.name,
      note: res.note,
      type: isLabel ? "label" : "continuous",
      w,
      h: isLabel ? h : 0,
      gap: Number($("gapMm").value) || 0
    };
    favs.custom.push(entry);
    saveFavs(favs);
    populatePaperProfiles();
    setProfileValue(entry.id);
    saveSettings();
    toast(`Guardado en mis papeles: ${entry.name}.`, "ok", 3000);
  } else if (p && p.userDefined) {
    favs.custom = favs.custom.filter((c) => c.id !== id);
    saveFavs(favs);
    populatePaperProfiles();
    setProfileValue("custom");
    saveSettings();
    toast(`Quitado de mis papeles: ${p.name}. Los valores siguen puestos como «Personalizado».`, "info", 4000);
  } else if (favs.ids.includes(id)) {
    favs.ids = favs.ids.filter((x) => x !== id);
    saveFavs(favs);
    populatePaperProfiles();
    toast("Quitado de mis papeles.", "info", 2500);
  } else {
    favs.ids.push(id);
    saveFavs(favs);
    populatePaperProfiles();
    toast("Añadido a mis papeles.", "ok", 2500);
  }
  updateFavButton();
  updatePaperInfo();
});

$("chkOnlyFavs").addEventListener("change", () => {
  saveSettings();
  populatePaperProfiles();
});

function profileMatchesValues(p) {
  return (
    $("paperMode").value === p.type &&
    getPaperWidthMm() === p.w &&
    (p.type !== "label" || (Number($("labelHeightMm").value) || 30) === p.h)
  );
}

// Si los ajustes guardados no traen tipo de papel (o no cuadra), se deduce de los valores.
function ensureProfileSelected() {
  const p = getProfile($("paperProfile").value);
  if (p && (p.id === "custom" || profileMatchesValues(p))) return;
  const type = $("paperMode").value;
  const match = findProfileFor(type, getPaperWidthMm(), Number($("labelHeightMm").value) || 30);
  setProfileValue(match && profileMatchesValues(match) ? match.id : "custom");
}

$("paperProfile").addEventListener("change", () => {
  applyPaperProfile($("paperProfile").value);
  updateFavButton();
});

// Cambiar un valor avanzado a mano pasa el tipo a "Personalizado" si ya no coincide.
function markCustomIfChanged() {
  const p = getProfile($("paperProfile").value);
  if (!p || p.id === "custom") return;
  const same = profileMatchesValues(p);
  if (!same) {
    setProfileValue("custom");
    saveSettings();
  }
}

$("paperMode").addEventListener("change", () => {
  const isLabel = $("paperMode").value === "label";
  $("labelHeightWrap").style.display = isLabel ? "inline-flex" : "none";
  if (!isLabel) $("chkSendGap").checked = false;
  markCustomIfChanged();
  updatePaperInfo();
  renderScene();
});

$("paperWidthMm").addEventListener("input", () => {
  markCustomIfChanged();
  refitImageToPaper();
  updatePaperInfo();
  renderScene();
});

["labelHeightMm", "marginY"].forEach((id) => {
  $(id).addEventListener("input", () => {
    refitImageToPaper();
    if (id === "labelHeightMm") {
      markCustomIfChanged();
      updatePaperInfo();
    }
    renderScene();
  });
});

// --- Web Serial (COM) + Reensamblado de respuestas + Batería continua ---
function decodeStatusByte(b) {
  const map = {
    0x00: "Lista",
    0x01: "Tapa abierta",
    0x02: "Avanzando papel",
    0x03: "Error de papel",
    // Con la tapa abierta el sensor tampoco ve papel, así que la impresora
    // contesta lo mismo: no se puede distinguir una cosa de la otra.
    0x04: "Sin papel o tapa abierta",
    0x10: "Pausada",
    0x20: "Ocupada",
    0x24: "Sin papel o tapa abierta",
    0x30: "Batería baja",
    0x80: "Sobrecalentamiento",
    0x90: "Sin alimentación"
  };
  return map[b] || `Estado 0x${b.toString(16).padStart(2, "0")}`;
}

function handleIncomingMessage(data) {
  const ascii = new TextDecoder().decode(data).replace(/[\r\n]+/g, "");
  log(`<< [COM] hex: ${toHex(data)}`);

  for (const w of [...state.waiters]) {
    if (w.match(data)) {
      state.waiters = state.waiters.filter((x) => x !== w);
      w.resolve(data);
    }
  }

  if (ascii.startsWith("BATTERY") && data.length >= 10) {
    const pctBcd = data[8];
    const pct = (pctBcd >> 4) * 10 + (pctBcd & 0x0f);
    const charging = data[9] === 1;
    const pill = $("batteryPill");
    pill.textContent = `${pct}%`;
    pill.title = charging ? "Cargando" : "Batería";
    pill.className = `pill i ${charging ? "i-bolt" : "i-battery"} ${pct <= 20 && !charging ? "warn" : "ok"}`;
    log(`   -> Batería: ${pct}% (${charging ? "Cargando" : "Sin cargador"})`);
    return;
  }

  if (ascii.startsWith("CONFIG") && data.length >= 17) {
    const dpi = (data[7] << 8) | data[8];
    const hw = `${data[9]}.${data[10]}.${data[11]}`;
    const fw = `${data[12]}.${data[13]}.${data[14]}`;
    log(`   -> Config: ${dpi} DPI | HW ${hw} | FW ${fw}`);
    return;
  }

  if (data.length === 1) {
    log(`   -> Estado: ${decodeStatusByte(data[0])}`);
    return;
  }

  if (data.length === 2 && data[0] === 0x63) {
    log(`   -> Impresión terminada (${decodeStatusByte(data[1])})`);
    return;
  }

  if (data.length === 16) {
    const status = decodeStatusByte(data[0]);
    const gapMm = data[6] || 3;
    const typeCode = data[7];
    const heightMm = data[11];
    const widthMm = data[13];
    const types = { 0: "Continuo", 1: "Etiqueta", 2: "Marca negra" };
    const type = types[typeCode] ?? `Tipo(${typeCode})`;
    log(`   -> Rollo RFID: ${status} | ${widthMm}×${heightMm} mm | ${type}`);

    state.detectedRoll = { type: typeCode === 1 ? "label" : typeCode === 0 ? "continuous" : null, w: widthMm, h: heightMm };
    if ($("chkIgnoreChip").checked) {
      log("   (chip del rollo ignorado: cartucho rellenado)");
      return;
    }
    if (typeCode === 1 && heightMm > 0) {
      const match = findProfileFor("label", widthMm || 54, heightMm);
      setProfileValue(match ? match.id : "custom");
      $("paperMode").value = "label";
      $("labelHeightWrap").style.display = "inline-flex";
      $("labelHeightMm").value = String(heightMm);
      $("gapMm").value = String(gapMm);
      // Solo se toca el ancho si el rollo es más estrecho que el cabezal (48 mm).
      if (widthMm > 0 && widthMm < 48) $("paperWidthMm").value = String(widthMm);
      saveSettings();
      updatePaperInfo();
      renderScene();
      toast(`Rollo detectado: etiqueta ${widthMm}×${heightMm} mm.`, "info", 3500);
    } else if (typeCode === 0) {
      setProfileValue("c54");
      $("paperMode").value = "continuous";
      $("labelHeightWrap").style.display = "none";
      if (widthMm > 0 && widthMm < 48) $("paperWidthMm").value = String(widthMm);
      saveSettings();
      updatePaperInfo();
      renderScene();
      toast("Rollo continuo detectado.", "info", 3500);
    }
  }
}

function flushRxBuffer() {
  if (state.rxTimer) {
    clearTimeout(state.rxTimer);
    state.rxTimer = null;
  }
  if (state.rxBuffer.length > 0) {
    const msg = state.rxBuffer;
    state.rxBuffer = new Uint8Array(0);
    handleIncomingMessage(msg);
  }
}

function pushRxChunk(chunk) {
  const merged = new Uint8Array(state.rxBuffer.length + chunk.length);
  merged.set(state.rxBuffer, 0);
  merged.set(chunk, state.rxBuffer.length);
  state.rxBuffer = merged;

  if (state.rxTimer) clearTimeout(state.rxTimer);
  state.rxTimer = setTimeout(flushRxBuffer, 70);
}

// Espera una respuesta concreta de la impresora (o null si no llega a tiempo).
function waitForMessage(match, timeoutMs) {
  return new Promise((resolve) => {
    const waiter = { match, resolve: null };
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter((x) => x !== waiter);
      resolve(null);
    }, timeoutMs);
    waiter.resolve = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    state.waiters.push(waiter);
  });
}

function cancelWaiters() {
  const pending = state.waiters;
  state.waiters = [];
  for (const w of pending) w.resolve(null);
}

async function readSerialLoop() {
  const reader = state.serialReader;
  let lostReason = "";
  try {
    while (state.serialReader === reader) {
      const { value, done } = await reader.read();
      if (done) {
        lostReason = "el puerto se ha cerrado";
        break;
      }
      if (value && value.length > 0) {
        pushRxChunk(value);
      }
    }
  } catch (err) {
    lostReason = err.message;
  }
  // Si el bucle termina sin que el usuario haya desconectado, la conexión se ha perdido.
  if (state.serialReader === reader && isConnected()) {
    log(`Conexión perdida: ${lostReason}`);
    toast("Se ha perdido la conexión con la impresora. Intentando reconectar…", "warn", 6000);
    await disconnectSerial();
    scheduleReconnect(0);
  }
}

async function disconnectSerial() {
  cancelWaiters();
  if (state.batteryTimer) {
    clearInterval(state.batteryTimer);
    state.batteryTimer = null;
  }
  if (state.rxTimer) {
    clearTimeout(state.rxTimer);
    state.rxTimer = null;
  }
  state.rxBuffer = new Uint8Array(0);

  // Se sueltan las referencias antes de cerrar para que el bucle de lectura
  // sepa que el cierre es intencionado y no lo trate como una pérdida.
  const reader = state.serialReader;
  const writer = state.serialWriter;
  const port = state.serialPort;
  state.serialPort = null;
  state.serialWriter = null;
  state.serialReader = null;

  if (reader) {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
  }
  if (writer) {
    try { writer.releaseLock(); } catch {}
  }
  if (port) {
    try { await port.close(); } catch {}
  }

  state.isBusy = false;
  updateUI();
}

async function queryInitialInfo() {
  try {
    if (!isConnected() || state.isBusy) return;
    await state.serialWriter.write(new TextEncoder().encode("BATTERY?\r\n"));
    await sleep(250);
    if (!isConnected() || state.isBusy) return;
    await state.serialWriter.write(new Uint8Array([0x1b, 0x21, 0x6f]));
    await sleep(250);
    if (!isConnected() || state.isBusy) return;
    await state.serialWriter.write(new TextEncoder().encode("CONFIG?\r\n"));
  } catch (err) {
    log(`Aviso consulta inicial: ${err.message}`);
  }
}

// Mensaje claro cuando el puerto está ocupado (otra pestaña, otra app…)
function friendlyOpenError(err) {
  const m = String((err && err.message) || err);
  if (/in progress|already open|Failed to open|NetworkError|Access denied|acceso denegado/i.test(m) || (err && err.name === "NetworkError")) {
    return "El puerto de la impresora está ocupado o no responde. ¿Tienes la app abierta en otra pestaña o ventana (por ejemplo la versión normal y la de pruebas a la vez)? Ciérrala, comprueba que la impresora está encendida y vuelve a conectar.";
  }
  return `No se pudo conectar: ${m}`;
}

async function attachPort(port) {
  state.serialPort = port;
  state.serialWriter = port.writable.getWriter();
  state.serialReader = port.readable.getReader();
  rememberPort(port);
  try { localStorage.setItem("pm270.autoConnect", "1"); } catch {}

  log("Impresora conectada por puerto COM.");
  readSerialLoop();
  startSession();
}

// Lo común a cualquier conexión (puerto serie o Bluetooth LE): consultas iniciales y batería.
function startSession() {
  updateUI();
  setTimeout(queryInitialInfo, 150);
  state.batteryTimer = setInterval(async () => {
    if (isConnected() && !state.isBusy) {
      try {
        await state.serialWriter.write(new TextEncoder().encode("BATTERY?\r\n"));
      } catch {}
    }
  }, 20000);
}

// Abre el puerto una sola vez aunque se pida a la vez desde el botón y desde
// la reconexión automática (por Bluetooth abrir tarda unos segundos).
function openPort(port) {
  if (state.opening) return state.opening;
  state.opening = (async () => {
    await null; // deja que state.opening quede asignado antes de pintar «Conectando…»
    updateUI();
    try {
      try {
        await port.open({ baudRate: 115200 });
      } catch (err) {
        // Puerto que se quedó abierto de un intento anterior: se cierra y se reintenta una vez.
        if (err && err.name === "InvalidStateError" && /already open/i.test(err.message)) {
          try { await port.close(); } catch {}
          await port.open({ baudRate: 115200 });
        } else {
          throw err;
        }
      }
      await attachPort(port);
    } finally {
      state.opening = null;
      updateUI();
    }
  })();
  return state.opening;
}

function cancelReconnect() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

// Si se pierde la conexión, se reintenta sola unas cuantas veces, cada vez más espaciadas.
const RECONNECT_DELAYS = [1500, 4000, 8000, 15000, 30000];
function scheduleReconnect(attempt) {
  cancelReconnect();
  if (attempt >= RECONNECT_DELAYS.length) {
    toast("No he podido reconectar sola. Pulsa «Conectar impresora».", "warn", 9000);
    return;
  }
  state.reconnectTimer = setTimeout(async () => {
    state.reconnectTimer = null;
    if (isConnected()) return;
    const ok = await tryAutoConnect(`intento ${attempt + 1}`);
    if (!ok && !isConnected()) scheduleReconnect(attempt + 1);
  }, RECONNECT_DELAYS[attempt]);
}

function samePortInfo(a, b) {
  if (!a || !b) return false;
  const keys = ["usbVendorId", "usbProductId", "bluetoothServiceClassId"];
  const relevant = keys.filter((k) => a[k] !== undefined || b[k] !== undefined);
  return relevant.length > 0 && relevant.every((k) => a[k] === b[k]);
}

// Busca entre los puertos ya autorizados el que se usó la última vez.
async function findRememberedPort() {
  if (!navigator.serial || !navigator.serial.getPorts) return null;
  const ports = await navigator.serial.getPorts();
  if (ports.length === 0) return null;
  const saved = getRememberedPortInfo();
  const match = ports.find((p) => samePortInfo(p.getInfo ? p.getInfo() : {}, saved));
  if (match) return match;
  return ports.length === 1 ? ports[0] : null;
}

async function tryAutoConnect(reason) {
  if (isConnected()) return true;
  if (state.isBusy) return false;
  let wanted = "1";
  try { wanted = localStorage.getItem("pm270.autoConnect") ?? "1"; } catch {}
  if (wanted !== "1") return false;
  if (NATIVE) {
    if (!NATIVE.hasRemembered()) return false;
    log(`Reconectando automáticamente (${reason})...`);
    const ok = await connectNative(false);
    if (ok) cancelReconnect();
    return Boolean(ok);
  }
  try {
    if (state.opening) {
      await state.opening;
      return isConnected();
    }
    const port = await findRememberedPort();
    if (!port) return false;
    if (isConnected()) return true;
    log(`Reconectando automáticamente (${reason})...`);
    await openPort(port);
    cancelReconnect();
    toast("Impresora conectada.", "ok", 2500);
    return true;
  } catch (err) {
    log(`Reconexión automática no posible: ${err.message}`);
    if (!isConnected()) await disconnectSerial();
    return false;
  }
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

$("btnConnectSerial").addEventListener("click", async () => {
  if (NATIVE) {
    connectNative(true);
    return;
  }
  if (!navigator.serial) {
    // Sin puerto serie (iPhone con Bluefy, Chrome Android antiguo…): Bluetooth LE.
    if (navigator.bluetooth) {
      connectBle();
      return;
    }
    const msg = IS_IOS ? t("conn.noApiIos") : IS_ANDROID ? t("conn.noApiAndroid") : t("conn.noApi");
    toast(msg, "error", 12000);
    return;
  }

  if (state.opening) {
    toast("Conectando con la impresora, espera un momento…", "info", 3000);
    return;
  }
  cancelReconnect();
  try {
    await disconnectSerial();
    log("Abriendo selector de puerto COM...");
    const port = await navigator.serial.requestPort();
    await openPort(port);
    toast("Impresora conectada.", "ok", 2500);
  } catch (err) {
    log(`ERROR al conectar: ${err.message}`);
    if (err.name !== "NotFoundError") {
      toast(friendlyOpenError(err), "error", 10000);
    }
    if (!isConnected()) await disconnectSerial();
  }
});

$("btnDisconnect").addEventListener("click", async () => {
  try { localStorage.setItem("pm270.autoConnect", "0"); } catch {}
  cancelReconnect();
  await disconnectSerial();
  log("Impresora desconectada.");
});

if (navigator.serial) {
  navigator.serial.addEventListener("disconnect", async (ev) => {
    if (ev.target === state.serialPort || ev.port === state.serialPort) {
      log("La impresora se ha desconectado del PC.");
      toast("La impresora se ha desconectado. Intentando reconectar…", "warn", 6000);
      await disconnectSerial();
      scheduleReconnect(0);
    }
  });
  navigator.serial.addEventListener("connect", () => {
    setTimeout(() => tryAutoConnect("impresora detectada"), 800);
  });
}

// --- App Android (APK): Bluetooth clásico nativo ---
// La APK mete esta misma web en una ventana propia y le da un puente
// (window.PM270Native) para hablar con la impresora por Bluetooth, sin https
// ni ajustes de Chrome. Se imita el escritor del puerto serie.
const NATIVE = window.PM270Native || null;

// Versión en Ajustes: la de version.js, o la de la APK si es una compilación de prueba.
(function showVersion() {
  let v = typeof APP_VERSION === "string" ? APP_VERSION : "";
  try { if (NATIVE && NATIVE.version) v = NATIVE.version() || v; } catch (_) {}
  const el = document.getElementById("appVersion");
  if (el) el.textContent = v;
  const url = typeof DONATE_URL === "string" ? DONATE_URL : "";
  const box = document.getElementById("donateBox");
  if (box && /^https:\/\//.test(url)) { document.getElementById("coffeeLink").href = url; box.hidden = false; }
})();

function bytesToB64(u8) {
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Respuestas del lado nativo (las llama la APK).
let nativeWaiting = null;
window.__pm270n = {
  back() {
    return closeTopLayer();
  },
  onConnected(name) {
    const port = { native: true, async close() { try { NATIVE.disconnect(); } catch {} } };
    state.serialPort = port;
    state.serialWriter = {
      async write(bytes) {
        if (!NATIVE.write(bytesToB64(bytes))) throw new Error(t("conn.nativeWriteFail"));
      },
      releaseLock() {}
    };
    state.serialReader = null;
    try { localStorage.setItem("pm270.autoConnect", "1"); } catch {}
    log(`Impresora conectada por Bluetooth (${name || "PM270"}).`);
    startSession();
    toast(t("conn.connected"), "ok", 2500);
    if (nativeWaiting) nativeWaiting(true);
  },
  onError(msg, quiet) {
    log(`Bluetooth: ${msg}`);
    if (!quiet) toast(msg, "error", 9000);
    if (nativeWaiting) nativeWaiting(false);
  },
  onData(b64) {
    if (state.serialPort && state.serialPort.native) pushRxChunk(b64ToBytes(b64));
  },
  async onLost(msg) {
    if (!(state.serialPort && state.serialPort.native)) return;
    log(`Conexión perdida: ${msg}`);
    toast(t("conn.lostRetry"), "warn", 6000);
    await disconnectSerial();
    scheduleReconnect(0);
  }
};

// choose = true: el usuario pulsa el botón y elige la impresora en la lista.
// choose = false: se reconecta sola a la última, sin avisos si no está.
function connectNative(choose) {
  if (state.opening) return state.opening;
  cancelReconnect();
  state.opening = (async () => {
    await null;
    updateUI();
    try {
      await disconnectSerial();
      return await new Promise((resolve) => {
        nativeWaiting = resolve;
        if (choose) NATIVE.choose();
        else NATIVE.reconnect();
      });
    } finally {
      nativeWaiting = null;
      state.opening = null;
      updateUI();
    }
  })();
  return state.opening;
}

// --- Bluetooth LE (Web Bluetooth) ---
// La PM270 tiene un canal BLE: escribir en la característica ff02 y recibir
// respuestas por notificaciones en ff01 (ver probe_pc.py). Se usa cuando el
// navegador no tiene puerto serie (p. ej. iPhone con Bluefy) o desde Ajustes.
// Se imita la interfaz del puerto serie (writer.write) para reutilizar todo lo demás.
const BLE_SERVICES = [0xff00, 0xff01, 0xae30, 0x18f0, 0xfee7, "49535343-fe7d-4ae5-8fa9-9fafd205e455", "e7810a71-73ae-499d-8c15-faa9aef0c3f2"];

async function findBleChannel(server) {
  let write = null;
  let notify = null;
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    let chars = [];
    try { chars = await svc.getCharacteristics(); } catch { continue; }
    for (const c of chars) {
      const id = c.uuid.toLowerCase();
      if (id.startsWith("0000ff02")) write = c;
      else if (id.startsWith("0000ff01")) notify = c;
    }
    if (write && notify) break;
  }
  // Otros modelos: primera característica que admita escribir y primera con notificaciones.
  if (!write || !notify) {
    for (const svc of services) {
      let chars = [];
      try { chars = await svc.getCharacteristics(); } catch { continue; }
      for (const c of chars) {
        if (!write && (c.properties.write || c.properties.writeWithoutResponse)) write = c;
        if (!notify && (c.properties.notify || c.properties.indicate)) notify = c;
      }
    }
  }
  return write ? { write, notify } : null;
}

function makeBleWriter(ch) {
  let size = 180; // se reduce sola si el móvil no admite paquetes tan grandes
  const withResponse = ch.properties.write;
  const send = (part) => (withResponse ? ch.writeValueWithResponse(part) : ch.writeValueWithoutResponse(part));
  // Las operaciones GATT no pueden solaparse: cada envío espera al anterior.
  let queue = Promise.resolve();
  return {
    write(bytes) {
      const job = queue.then(() => sendAll(bytes));
      queue = job.catch(() => {});
      return job;
    },
    releaseLock() {}
  };
  async function sendAll(bytes) {
      for (let i = 0; i < bytes.length; ) {
        const part = bytes.slice(i, i + size);
        try {
          await send(part);
          i += part.length;
          if (!withResponse) await sleep(8);
        } catch (err) {
          if (size > 20) {
            size = size > 100 ? 100 : 20;
            log(`BLE: paquete reducido a ${size} bytes (${err.message})`);
            continue;
          }
          throw err;
        }
      }
  }
}

async function connectBle() {
  if (!navigator.bluetooth) {
    toast(IS_IOS ? t("conn.noApiIos") : t("conn.noApi"), "error", 12000);
    return;
  }
  if (state.opening) return;
  cancelReconnect();
  let device = null;
  try {
    await disconnectSerial();
    log("Abriendo selector Bluetooth LE...");
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    state.opening = (async () => {
      await null;
      updateUI();
      const server = await device.gatt.connect();
      const ch = await findBleChannel(server);
      if (!ch) throw new Error(t("conn.bleNoChannel"));
      const port = {
        ble: device,
        async close() { try { device.gatt.disconnect(); } catch {} }
      };
      if (ch.notify) {
        await ch.notify.startNotifications();
        ch.notify.addEventListener("characteristicvaluechanged", (ev) => {
          if (state.serialPort !== port) return;
          const v = ev.target.value;
          pushRxChunk(new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice());
        });
      }
      device.addEventListener("gattserverdisconnected", async () => {
        if (state.serialPort !== port) return;
        log("Conexión Bluetooth LE perdida.");
        toast(t("conn.bleLost"), "warn", 8000);
        await disconnectSerial();
      });
      state.serialPort = port;
      state.serialWriter = makeBleWriter(ch.write);
      state.serialReader = null;
      log(`Impresora conectada por Bluetooth LE (${device.name || "sin nombre"}).`);
      startSession();
    })();
    await state.opening;
    toast(t("conn.connectedBle"), "ok", 2500);
  } catch (err) {
    log(`ERROR al conectar por BLE: ${err.message}`);
    if (err.name !== "NotFoundError") toast(`${t("conn.bleFail")} ${err.message}`, "error", 10000);
    if (device && device.gatt && device.gatt.connected && !isConnected()) device.gatt.disconnect();
    if (!isConnected()) await disconnectSerial();
  } finally {
    state.opening = null;
    updateUI();
  }
}

if (navigator.bluetooth) {
  $("bleBox").hidden = false;
  $("btnConnectBle").addEventListener("click", () => {
    $("settingsDialog").close();
    connectBle();
  });
}

async function writeChunks(bytes, prog = null) {
  const CHUNK = 512;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    if (!isConnected()) throw new Error("Impresora desconectada durante el envío.");
    const chunk = bytes.slice(i, i + CHUNK);
    await state.serialWriter.write(chunk);
    if (prog) {
      prog.value = Math.min(100, Math.round(((i + chunk.length) / bytes.length) * 100));
    }
    await sleep(5);
  }
}

async function sendBytes(bytes, withProgress = false) {
  if (!isConnected()) throw new Error("Impresora no conectada.");
  if (state.isBusy) throw new Error("Impresión en curso.");

  state.isBusy = true;
  updateUI();

  const prog = $("printProgress");
  if (withProgress) {
    prog.style.display = "block";
    prog.value = 0;
  }

  try {
    await writeChunks(bytes, withProgress ? prog : null);
    return true;
  } finally {
    state.isBusy = false;
    if (withProgress) {
      setTimeout(() => {
        if (!state.isBusy) prog.style.display = "none";
      }, 600);
    }
    updateUI();
  }
}

document.querySelectorAll(".cmd-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      const cmd = `${btn.dataset.cmd}\r\n`;
      log(`>> ${JSON.stringify(cmd)}`);
      await sendBytes(new TextEncoder().encode(cmd));
    } catch (err) {
      log(`ERROR: ${err.message}`);
    }
  });
});

$("btnStatusByte").addEventListener("click", async () => {
  try {
    const cmd = new Uint8Array([0x1b, 0x21, 0x3f]);
    log(`>> ESC ! ? (${toHex(cmd)})`);
    await sendBytes(cmd);
  } catch (err) {
    log(`ERROR: ${err.message}`);
  }
});

$("btnLabelBlock").addEventListener("click", async () => {
  try {
    const cmd = new Uint8Array([0x1b, 0x21, 0x6f]);
    log(`>> ESC ! o (${toHex(cmd)})`);
    await sendBytes(cmd);
  } catch (err) {
    log(`ERROR: ${err.message}`);
  }
});

$("btnSelftest").addEventListener("click", async () => {
  try {
    log('>> "SELFTEST\\r\\n"');
    await sendBytes(new TextEncoder().encode("SELFTEST\r\n"));
  } catch (err) {
    log(`ERROR: ${err.message}`);
  }
});

$("btnClearLog").addEventListener("click", () => {
  logEl.textContent = "";
});

// Construye el trabajo TSPL exactamente igual que la versión original.
// También sirve para otros lienzos de 384 puntos de ancho (piezas del mural).
function buildPrintJob(src = canvas) {
  const w = src.width;
  const h = src.height;
  const wBytes = w / 8;
  const my = getMarginY();
  const density = Number($("density").value) || 10;
  const invert = $("invertBits").checked;
  const heightMm =
    $("paperMode").value === "label"
      ? Number($("labelHeightMm").value) || 30
      : (h + my * 2) / DOTS_PER_MM;

  const imgData = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const bitmap = new Uint8Array(wBytes * h);

  for (let y = 0; y < h; y++) {
    for (let xb = 0; xb < wBytes; xb++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        const isWhite = imgData[(y * w + x) * 4] > 127;
        const bitVal = invert ? (isWhite ? 0 : 1) : (isWhite ? 1 : 0);
        if (bitVal) byteVal |= 1 << (7 - bit);
      }
      bitmap[y * wBytes + xb] = byteVal;
    }
  }

  const gapLine = $("chkSendGap").checked ? `GAP ${Number($("gapMm").value) || 0} mm,0 mm\r\n` : "";
  const header =
    `SIZE ${getSizeWidthMm().toFixed(1)} mm,${Number(heightMm).toFixed(1)} mm\r\n` +
    gapLine +
    `DIRECTION 0,0\r\n` +
    `DENSITY ${density}\r\n` +
    `CLS\r\n` +
    `PRINT 1\r\n` +
    `BITMAP 0,${my},${wBytes},${h},1,`;
  const footer = `ALLEND\r\n\r\n`;

  const enc = new TextEncoder();
  const hBytes = enc.encode(header);
  const fBytes = enc.encode(footer);
  const job = new Uint8Array(hBytes.length + bitmap.length + fBytes.length);
  job.set(hBytes, 0);
  job.set(bitmap, hBytes.length);
  job.set(fBytes, hBytes.length + bitmap.length);
  return { job, w, h, heightMm };
}

// Estados en los que NO se debe enviar nada para no gastar etiquetas.
const BLOCKING_STATUS = new Set([0x01, 0x03, 0x04, 0x24, 0x80, 0x90]);
const STATUS_TIMEOUT_MS = 1200;

// Pregunta el estado (ESC ! ?) antes de imprimir.
// Devuelve { ok, msg }. Si la impresora no contesta se permite imprimir
// (como hacía la versión original), pero se anota en el registro.
async function checkPrinterReady() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const reply = waitForMessage((d) => d.length === 1, STATUS_TIMEOUT_MS);
    log(">> ESC ! ? (comprobación antes de imprimir)");
    await state.serialWriter.write(new Uint8Array([0x1b, 0x21, 0x3f]));
    const data = await reply;
    if (!isConnected()) return { ok: false, msg: "Impresora desconectada." };
    if (!data) {
      log("   (la impresora no ha contestado al estado; se imprime igualmente)");
      return { ok: true };
    }
    const code = data[0];
    if (code === 0x00) return { ok: true };
    if (code === 0x20) {
      log("   -> Ocupada, reintentando...");
      await sleep(1500);
      continue;
    }
    if (BLOCKING_STATUS.has(code)) {
      const hex = `0x${code.toString(16).padStart(2, "0")}`;
      log(`   -> Bloqueado por estado ${hex}`);
      return { ok: false, msg: `No se imprime: ${decodeStatusByte(code)}. Revisa que la tapa esté bien cerrada y que haya papel.` };
    }
    if (code === 0x30) toast("Batería baja. Conviene cargar la impresora.", "warn", 6000);
    return { ok: true };
  }
  return { ok: false, msg: "La impresora sigue ocupada. Inténtalo en unos segundos." };
}

// --- Confirmación de papel antes de imprimir ---
function describeCurrentPaper() {
  const p = getProfile($("paperProfile").value);
  if (p && p.id !== "custom") return p.name;
  return $("paperMode").value === "label"
    ? `Etiqueta ${getPaperWidthMm()}×${Number($("labelHeightMm").value) || 30} mm`
    : `Rollo continuo ${getPaperWidthMm()} mm`;
}

function paperKey() {
  return `${$("paperProfile").value}|${$("paperMode").value}|${getPaperWidthMm()}|${$("labelHeightMm").value}`;
}

// Diferencia entre el rollo que dice la impresora (chip) y el papel elegido.
function rollMismatch() {
  if ($("chkIgnoreChip").checked) return "";
  const r = state.detectedRoll;
  if (!r || !r.type) return "";
  const mode = $("paperMode").value;
  if (r.type !== mode) {
    return r.type === "label"
      ? `La impresora dice que tiene puestas etiquetas de ${r.w}×${r.h} mm, pero has elegido rollo continuo.`
      : "La impresora dice que tiene puesto rollo continuo, pero has elegido etiquetas.";
  }
  if (mode === "label" && r.h > 0 && r.h !== (Number($("labelHeightMm").value) || 30)) {
    return `La impresora dice que las etiquetas son de ${r.w}×${r.h} mm, pero has elegido ${describeCurrentPaper()}.`;
  }
  return "";
}

function askPaperConfirm(message, warn) {
  return new Promise((resolve) => {
    const dlg = $("paperDialog");
    $("paperDialogText").textContent = message;
    $("paperDialogWarn").textContent = warn || "";
    $("paperDialogWarn").hidden = !warn;
    const done = (ok) => {
      dlg.close();
      $("paperDialogOk").onclick = null;
      $("paperDialogCancel").onclick = null;
      resolve(ok);
    };
    $("paperDialogOk").onclick = () => done(true);
    $("paperDialogCancel").onclick = () => done(false);
    dlg.oncancel = (ev) => {
      ev.preventDefault();
      done(false);
    };
    dlg.showModal();
  });
}

// Pregunta si el papel puesto es el elegido la primera vez que se imprime con
// un papel nuevo, o siempre que no coincida con lo que dice la impresora.
async function confirmPaperIfNeeded() {
  const warn = rollMismatch();
  let last = "";
  try { last = localStorage.getItem("pm270.confirmedPaper") || ""; } catch {}
  if (!warn && last === paperKey()) return true;
  const ok = await askPaperConfirm(`Vas a imprimir en: ${describeCurrentPaper()}. ¿Es el papel que tienes puesto?`, warn);
  if (ok) {
    try { localStorage.setItem("pm270.confirmedPaper", paperKey()); } catch {}
  }
  return ok;
}

// Envía una cola de trabajos uno tras otro (copias de la etiqueta o piezas del mural),
// comprobando la impresora antes de cada uno y parando si algo va mal.
// items: [{ job, w, h, heightMm, name? }]. Devuelve cuántos se imprimieron.
async function printQueue(items, { onProgress = null, onPrinted = null } = {}) {
  if (!isConnected() || state.isBusy || !items.length) return 0;
  if (!(await confirmPaperIfNeeded())) {
    log("Impresión cancelada: papel no confirmado.");
    return 0;
  }
  if (!isConnected() || state.isBusy) return 0;
  state.isBusy = true;
  updateUI();
  const prog = $("printProgress");

  const total = items.length;
  const pieces = items.some((it) => it.name);
  let printed = 0;
  state.cancelPrint = false;
  $("btnCancelPrint").hidden = total < 2;

  try {
    for (let n = 1; n <= total; n++) {
      const { job, w, h, heightMm, name } = items[n - 1];
      if (state.cancelPrint) {
        toast(`Detenido: impresas ${n - 1} de ${total}.`, "info", 5000);
        break;
      }
      // Se comprueba antes de cada copia: el papel puede acabarse a mitad.
      const ready = $("chkStatusCheck").checked ? await checkPrinterReady() : { ok: true };
      if (!ready.ok) {
        log(ready.msg);
        toast(total > 1 ? `${ready.msg} (impresas ${n - 1} de ${total})` : ready.msg, "error", 8000);
        return printed;
      }

      const what = name ? `${name} (${n}/${total}): ` : total > 1 ? `copia ${n}/${total}: ` : "";
      log(`Imprimiendo ${what}${w}×${h} px (${job.length} B)...`);
      if (total > 1) $("btnPrint").textContent = name ? `${name} (${n} de ${total})…` : `Copia ${n} de ${total}…`;
      if (onProgress) onProgress(n, total, items[n - 1]);

      // Se prepara la espera de "impresión terminada" antes de enviar.
      const doneTimeout = 8000 + Math.round(heightMm * 150);
      const done = waitForMessage((d) => d.length === 2 && d[0] === 0x63, doneTimeout);

      prog.style.display = "block";
      prog.value = 0;
      await writeChunks(job, prog);
      log("Etiqueta enviada.");

      const result = await done;
      if (!isConnected()) return printed;
      printed++;
      if (onPrinted) onPrinted(items[n - 1]);
      if (!result) {
        log("   (la impresora no ha confirmado el final; se desbloquea igualmente)");
      } else if (result[1] !== 0x00) {
        toast(`La impresora avisa: ${decodeStatusByte(result[1])}.`, "warn", 8000);
        if (total > 1) return printed;
      } else if (n === total) {
        const isPiece = pieces && String(items[0].name).startsWith("Pieza");
        const msg = isPiece ? `${total === 1 ? "Pieza impresa" : `${total} piezas impresas`}.` : total > 1 ? `${total} etiquetas impresas.` : "Etiqueta impresa.";
        toast(msg, "ok", 2500);
      }
    }
  } catch (err) {
    log(`ERROR al imprimir: ${err.message}`);
    toast(`Error al imprimir: ${err.message}`, "error", 8000);
  } finally {
    state.isBusy = false;
    $("btnCancelPrint").hidden = true;
    setTimeout(() => {
      if (!state.isBusy) prog.style.display = "none";
    }, 600);
    updateUI();
  }
  return printed;
}

$("btnPrint").addEventListener("click", async () => {
  if (!isConnected() || state.isBusy) return;
  if (typeof muralActive === "function" && muralActive()) return printMural();
  const copies = Math.max(1, Math.min(99, Math.round(Number($("copies").value) || 1)));
  if (isPerLine()) {
    const items = [];
    for (const line of perLineLines()) {
      const built = jobForLine(line);
      for (let i = 0; i < copies; i++) items.push({ ...built, name: `«${line}»` });
    }
    await printQueue(items);
    return;
  }
  const one = buildPrintJob();
  await printQueue(Array.from({ length: copies }, () => one));
});

// --- Una etiqueta por línea (lista de nombres) ---
function isPerLine() {
  const chk = $("chkPerLine");
  return Boolean(chk && chk.checked) && !(typeof muralActive === "function" && muralActive());
}

function perLineLines() {
  return textLayer.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// Trabajo de impresión con solo esa línea de texto (el resto del diseño igual).
function jobForLine(line) {
  const full = textLayer.text;
  state.lineOverride = true;
  try {
    textLayer.text = line;
    renderSceneNow();
    return buildPrintJob();
  } finally {
    textLayer.text = full;
    state.lineOverride = false;
    renderScene();
  }
}

function updatePerLineInfo(lines) {
  const box = $("perLineNav");
  if (!box) return;
  const on = Boolean(lines);
  box.hidden = !on || lines.length < 1;
  if (!on) return;
  const n = lines.length;
  const copies = Math.max(1, Math.min(99, Math.round(Number($("copies").value) || 1)));
  $("perLineInfo").textContent = n ? `${state.previewLine + 1} de ${n}` : "";
  $("perLinePrev").disabled = state.previewLine <= 0;
  $("perLineNext").disabled = state.previewLine >= n - 1;
  if (!state.isBusy && isConnected() && n) {
    const total = n * copies;
    $("btnPrint").textContent = total === 1 ? "Imprimir 1 etiqueta" : `Imprimir ${total} etiquetas`;
  }
}

$("chkPerLine").addEventListener("change", () => {
  if ($("chkPerLine").checked && $("chkListMode").checked) {
    $("chkListMode").checked = false;
  }
  state.previewLine = 0;
  saveSettings();
  renderScene();
});
$("perLinePrev").addEventListener("click", () => {
  state.previewLine = Math.max(0, (state.previewLine || 0) - 1);
  renderScene();
});
$("perLineNext").addEventListener("click", () => {
  state.previewLine = (state.previewLine || 0) + 1;
  renderScene();
});
$("copies").addEventListener("input", () => {
  if (isPerLine()) updatePerLineInfo(perLineLines());
});

// --- Deshacer / rehacer (diseño: texto, dibujo, marco) ---
const designHistory = { past: [], future: [], last: null, timer: null, restoring: false };

function snapshotDesign() {
  syncLayers();
  // Con «una etiqueta por línea» el texto actual puede estar recortado a una línea.
  const copy = (l) => (l === textLayer ? { ...l, text: $("textInput").value } : { ...l });
  return {
    layers: layers.map(copy),
    textIdx: layers.indexOf(textLayer),
    imgIdx: layers.indexOf(imgLayer),
    text: copy(textLayer),
    img: copy(imgLayer),
    frame: frameLayer.style,
    frameScale: frameLayer.scale,
    ui: {
      textInput: $("textInput").value,
      fontSize: $("fontSize").value,
      textAlign: $("textAlign").value,
      chkListMode: $("chkListMode").checked,
      imgScale: $("imgScale").value
    }
  };
}

// Identificador estable de cada imagen, para comparar diseños sin serializarlas.
const sourceIds = new WeakMap();
let sourceSeq = 0;
function sourceId(src) {
  if (!src) return 0;
  if (!sourceIds.has(src)) sourceIds.set(src, ++sourceSeq);
  return sourceIds.get(src);
}
function designKey(o) {
  const strip = (l) => ({ ...l, source: sourceId(l.source), original: sourceId(l.original) });
  return JSON.stringify({ l: o.layers.map(strip), t: o.textIdx, i: o.imgIdx, tx: strip(o.text), im: strip(o.img), frame: o.frame, fs: o.frameScale || 100, ui: o.ui });
}
function imagesKey(o) {
  return o.layers.map((l) => sourceId(l.source)).join(",");
}

function sameDesign(a, b) {
  if (!a || !b) return false;
  return designKey(a) === designKey(b);
}

function scheduleHistory() {
  if (designHistory.restoring) return;
  clearTimeout(designHistory.timer);
  const last = designHistory.last;
  // Cambios de golpe (otra imagen, otro marco): se guardan ya, sin esperar.
  if (last && (imagesKey(last) !== imagesKey(snapshotDesign()) || last.frame !== frameLayer.style || (last.frameScale || 100) !== (frameLayer.scale || 100))) {
    recordHistory();
    return;
  }
  designHistory.timer = setTimeout(recordHistory, 450);
  // Se puede deshacer en seguida, sin esperar a que se guarde el paso.
  if (designHistory.last) $("btnUndo").disabled = false;
}

function recordHistory() {
  const snap = snapshotDesign();
  if (sameDesign(snap, designHistory.last)) return;
  if (designHistory.last) {
    designHistory.past.push(designHistory.last);
    if (designHistory.past.length > 60) designHistory.past.shift();
    designHistory.future = [];
  }
  designHistory.last = snap;
  updateHistoryButtons();
}

function restoreDesign(snap) {
  designHistory.restoring = true;
  layers = snap.layers.map((l) => ({ ...l }));
  textLayer = snap.textIdx >= 0 ? layers[snap.textIdx] : { ...snap.text };
  imgLayer = snap.imgIdx >= 0 ? layers[snap.imgIdx] : { ...snap.img };
  frameLayer.style = snap.frame;
  frameLayer.scale = snap.frameScale || 100;
  $("textInput").value = snap.ui.textInput;
  $("fontSize").value = snap.ui.fontSize;
  $("fontSizeVal").textContent = snap.ui.fontSize;
  $("textAlign").value = snap.ui.textAlign;
  $("chkListMode").checked = snap.ui.chkListMode;
  $("imgScale").value = snap.ui.imgScale;
  $("imgScaleVal").textContent = `${snap.ui.imgScale}%`;
  $("textRotVal").textContent = `${textLayer.rotation}°`;
  if (typeof updateFrameInfo === "function") updateFrameInfo();
  renderScene();
  designHistory.last = snap;
  designHistory.restoring = false;
  updateHistoryButtons();
}

function undoDesign() {
  clearTimeout(designHistory.timer);
  recordHistory();
  if (!designHistory.past.length) return;
  designHistory.future.push(designHistory.last);
  restoreDesign(designHistory.past.pop());
}

function redoDesign() {
  clearTimeout(designHistory.timer);
  recordHistory();
  if (!designHistory.future.length) return;
  designHistory.past.push(designHistory.last);
  restoreDesign(designHistory.future.pop());
}

function updateHistoryButtons() {
  $("btnUndo").disabled = !designHistory.past.length;
  $("btnRedo").disabled = !designHistory.future.length;
}

// «Empezar de nuevo»: deja la etiqueta en blanco (el papel y los ajustes se quedan).
$("btnResetDesign").addEventListener("click", () => {
  syncLayers();
  if (!layers.length && !frameLayer.style) return toast("La etiqueta ya está vacía.", "info", 2500);
  if (!window.confirm("¿Empezar de nuevo? Se quitan todos los textos, fotos, dibujos y el marco. Podrás deshacerlo con ↶.")) return;
  clearTimeout(designHistory.timer);
  recordHistory();
  clearAllLayers();
  frameLayer.style = null;
  frameLayer.scale = 100;
  $("chkListMode").checked = false;
  if (typeof updateFrameInfo === "function") updateFrameInfo();
  renderScene();
  recordHistory();
  toast("Etiqueta en blanco. Si te has equivocado, pulsa ↶ (deshacer).", "ok", 4000);
});
$("btnUndo").addEventListener("click", undoDesign);
$("btnRedo").addEventListener("click", redoDesign);
document.addEventListener("keydown", (ev) => {
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
  // En las casillas de texto manda el deshacer propio del navegador.
  const t = ev.target;
  if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && /text|number|search/.test(t.type)))) return;
  if (document.querySelector("dialog[open]")) return;
  const k = ev.key.toLowerCase();
  if (k === "z" && !ev.shiftKey) {
    ev.preventDefault();
    undoDesign();
  } else if (k === "y" || (k === "z" && ev.shiftKey)) {
    ev.preventDefault();
    redoDesign();
  }
});

$("btnCancelPrint").addEventListener("click", () => {
  state.cancelPrint = true;
  $("btnCancelPrint").textContent = "Deteniendo…";
  setTimeout(() => ($("btnCancelPrint").textContent = "Detener"), 3000);
});

// Ajustes: se guardan al cambiar
for (const id of PERSISTED_IDS) {
  const el = $(id);
  if (el) el.addEventListener("change", saveSettings);
  if (el && el.type !== "checkbox" && el.tagName !== "SELECT") el.addEventListener("input", saveSettings);
}

// --- Ventanas de ajustes, registro y guía de compra ---
function wireDialog(buttonId, dialogId) {
  const dlg = $(dialogId);
  $(buttonId).addEventListener("click", () => dlg.showModal());
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  // Clic fuera del contenido = cerrar
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) dlg.close();
  });
}
wireDialog("btnOpenSettings", "settingsDialog");
wireDialog("btnOpenLog", "logDialog");
wireDialog("btnOpenBuy", "buyDialog");
wireDialog("btnTestLabel", "testDialog");

// --- Etiqueta de prueba ---
// Una sola etiqueta con 12 muestras: filas = modo de foto, columnas = brillo
// (−30, actual, +30) y contraste +40, relativos a lo que hay puesto.
// La intensidad es un ajuste de la impresora para todo el trabajo: va escrita arriba.
const TEST_ROWS = [["atkinson", "LIMPIA"], ["dither", "TRAMADA"], ["threshold", "NÍTIDO"]];
function testColumns() {
  const b = Number($("brightness").value) || 0;
  const c = Number($("contrast").value) || 0;
  const clamp = (v) => Math.max(-100, Math.min(100, v));
  return [
    { b: clamp(b - 30), c, label: `B${clamp(b - 30)}` },
    { b, c, label: `B${b}` },
    { b: clamp(b + 30), c, label: `B+${clamp(b + 30)}`.replace("+-", "-") },
    { b, c: clamp(c + 40), label: `C${clamp(c + 40) >= 0 ? "+" : ""}${clamp(c + 40)}` }
  ];
}

// Muestra en gris: degradado, esfera sombreada y líneas finas.
function drawTestSample(g, w, h) {
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, "#000");
  grd.addColorStop(1, "#fff");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, Math.round(h * 0.32));
  const r = Math.min(w * 0.3, h * 0.32);
  const cx = w * 0.32;
  const cy = h * 0.32 + r + 2;
  const sph = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  sph.addColorStop(0, "#f4f4f4");
  sph.addColorStop(0.6, "#888");
  sph.addColorStop(1, "#202020");
  g.fillStyle = sph;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#555";
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = Math.round(w * 0.68 + i * 4) + 0.5;
    g.beginPath();
    g.moveTo(x, h * 0.4);
    g.lineTo(x, h - 3);
    g.stroke();
  }
}

function buildTestCanvas() {
  const H = getCanvasTargetHeight();
  const out = document.createElement("canvas");
  out.width = PRINT_WIDTH;
  out.height = H;
  const g = out.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  g.fillRect(0, 0, PRINT_WIDTH, H);
  const area = getPrintArea();
  const cols = testColumns();
  const head = 13;
  const cw = Math.floor(area.w / cols.length);
  const ch = Math.floor((H - head * 2) / TEST_ROWS.length);
  g.fillStyle = "#000";
  g.font = "bold 11px monospace";
  g.textBaseline = "top";
  g.fillText(`PRUEBA · INTENSIDAD ${$("density").value}/15`, area.x0 + 2, 1);
  cols.forEach((col, ci) => g.fillText(col.label, area.x0 + ci * cw + 3, head + 1));
  TEST_ROWS.forEach(([mode, name], ri) => {
    cols.forEach((col, ci) => {
      const cell = document.createElement("canvas");
      cell.width = cw - 4;
      cell.height = ch - 3;
      const cg = cell.getContext("2d", { willReadFrequently: true });
      cg.fillStyle = "#fff";
      cg.fillRect(0, 0, cell.width, cell.height);
      drawTestSample(cg, cell.width, cell.height);
      applyBinarizationToCanvas(cg, mode, { brightness: col.b, contrast: col.c });
      g.drawImage(cell, area.x0 + ci * cw + 2, head * 2 + ri * ch + 1);
    });
    // Nombre de la fila sobre una cajita blanca en la esquina de la primera muestra
    g.font = "bold 9px monospace";
    const tw = g.measureText(name).width + 4;
    const y = head * 2 + ri * ch + ch - 13;
    g.fillStyle = "#fff";
    g.fillRect(area.x0 + 2, y, tw, 11);
    g.fillStyle = "#000";
    g.fillText(name, area.x0 + 4, y + 1);
    g.font = "bold 11px monospace";
  });
  return out;
}

function refreshTestPreview() {
  const src = buildTestCanvas();
  const view = $("testCanvas");
  view.width = src.width;
  view.height = src.height;
  view.getContext("2d").drawImage(src, 0, 0);
  $("testPrint").disabled = !isConnected() || state.isBusy;
}
$("btnTestLabel").addEventListener("click", refreshTestPreview);
$("testPrint").addEventListener("click", async () => {
  if (!isConnected() || state.isBusy) return;
  $("testDialog").close();
  const built = buildPrintJob(buildTestCanvas());
  await printQueue([{ ...built, name: "Prueba" }]);
});

// --- Botón o gesto «atrás» del móvil (app Android) ---
// Cierra lo que esté abierto encima; devuelve false si no había nada.
function closeTopLayer() {
  const open = [...document.querySelectorAll("dialog[open]")];
  if (open.length) {
    open[open.length - 1].close();
    return true;
  }
  if (!$("layersPop").hidden) {
    closeLayers();
    return true;
  }
  return false;
}

// --- Vista previa ajustada al hueco disponible ---
function fitPreview() {
  const desk = $("stickerDesk");
  if (!desk) return;
  const wide = window.matchMedia("(min-width: 1100px) and (min-height: 600px)").matches;
  const availW = Math.max(120, desk.clientWidth - 48);
  const phone = window.matchMedia("(max-width: 700px)").matches;
  const availH = wide
    ? Math.max(120, desk.clientHeight - 48)
    : phone
      ? Math.max(70, desk.clientHeight - 24) // en el móvil la vista previa es fija y más baja
      : Math.round(window.innerHeight * 0.55);
  // En rollo continuo el ancho del papel se ve siempre igual y el largo crece
  // hacia abajo (con scroll en la vista previa), en vez de encoger el papel.
  const continuous = $("paperMode").value !== "label";
  desk.classList.toggle("continuous", continuous);
  // El margen se ve como papel en blanco arriba y abajo, con la zona que se
  // imprime marcada en discontinua.
  const my = getMarginY();
  const fullH = canvas.height + 2 * my;
  const scale = continuous
    ? Math.max(0.25, Math.min(availW / canvas.width, 1.6))
    : Math.max(0.25, Math.min(availW / canvas.width, availH / fullH, 2.5));
  const cw = Math.round(canvas.width * scale);
  const ch = Math.round(canvas.height * scale);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const padY = 6 + Math.round(my * scale);
  const stage = canvas.parentElement;
  stage.style.paddingTop = stage.style.paddingBottom = `${padY}px`;
  overlay.style.inset = `${padY}px auto auto 6px`;
  overlay.style.width = `${cw}px`;
  overlay.style.height = `${ch}px`;
  canvas.classList.toggle("with-margin", my > 0);
  updateDensityPreview();
}

// Intensidad: por debajo de 10 la vista previa se aclara (imprime más claro);
// por encima, los trazos engordan un poco (la tinta térmica se «come» el blanco).
function updateDensityPreview() {
  const d = Number($("density").value) || 10;
  if (d < 10) {
    canvas.style.filter = "";
    canvas.style.opacity = String((0.3 + (0.7 * (d - 1)) / 9).toFixed(2));
  } else {
    canvas.style.opacity = "";
    canvas.style.filter = d > 10 ? `drop-shadow(0 0 ${((d - 10) * 0.12).toFixed(2)}px #000)` : "";
  }
}
window.addEventListener("resize", fitPreview);

// --- App instalable (PWA) ---
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  installPrompt = ev;
  $("btnInstall").hidden = false;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  $("btnInstall").hidden = true;
  toast("App instalada. Ya puedes abrirla desde el menú Inicio o el escritorio.", "ok", 7000);
});
$("btnInstall").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch {}
  installPrompt = null;
  $("btnInstall").hidden = true;
});
if (NATIVE) {
  document.documentElement.classList.add("native-app");
  $("bleBox").hidden = true;
} else if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch((err) => log(`Aviso: sin modo sin conexión (${err.message}).`));
}

// --- Modo claro / oscuro (se recuerda; la primera vez sigue al sistema) ---
function applyThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const b = $("btnTheme");
  b.classList.toggle("i-moon", !dark);
  b.classList.toggle("i-sun", dark);
  b.title = dark ? "Modo claro" : "Modo oscuro";
  b.setAttribute("aria-label", b.title);
}
$("btnTheme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("pm270.theme", dark ? "dark" : "light"); } catch {}
  applyThemeButton();
  if (typeof drawMuralGuide === "function" && typeof muralActive === "function" && muralActive()) drawMuralGuide();
});
applyThemeButton();

// Inicialización
let savedProfileId = "";
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  $("chkOnlyFavs").checked = Boolean(saved.chkOnlyFavs);
  savedProfileId = saved.paperProfile || "";
} catch {}
populatePaperProfiles(savedProfileId);
loadSettings();
ensureProfileSelected();
updatePaperInfo();
renderScene();
tryAutoConnect("al abrir");