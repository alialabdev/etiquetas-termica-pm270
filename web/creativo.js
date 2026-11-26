// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
// =====================================================================
//  Galería creativa: marcos, plantillas, calendarios, juegos, colorear,
//  códigos QR / de barras y «Mis diseños».
//  Se carga después de app.js y usa sus funciones (renderScene, imgLayer…).
//  Todo se dibuja en negro sobre blanco y a tamaño real de impresión
//  (8 puntos por mm), para que salga nítido en papel térmico.
// =====================================================================

const FONT = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const fontB = (px) => `bold ${px}px ${FONT}`;
const fontN = (px) => `${px}px ${FONT}`;

// Generador pseudoaleatorio con semilla (para poder repetir un diseño)
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newSeed = () => Math.floor(Math.random() * 1e9);

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#000";
  g.strokeStyle = "#000";
  g.lineJoin = "round";
  g.lineCap = "round";
  return { c, g };
}

function wrapWords(g, text, maxW) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width <= maxW || !line) line = t;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

// Tamaño de destino: ancho imprimible y, en etiqueta, su alto. En continuo h = null.
function targetSize() {
  const area = getPrintArea();
  const isLabel = $("paperMode").value === "label";
  return { w: area.w, h: isLabel ? getCanvasTargetHeight() : null, round: isRoundPaper() };
}

// ---------------------------------------------------------------------
//  Motivos pequeños (para marcos y dibujos)
// ---------------------------------------------------------------------
function motifStar(g, x, y, r, rot = -Math.PI / 2, fill = true) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = rot + (i * Math.PI) / 5;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  fill ? g.fill() : g.stroke();
}

function motifHeart(g, x, y, r, fill = true) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.1, x, y + r * 0.9);
  g.closePath();
  fill ? g.fill() : g.stroke();
}

function motifFlower(g, x, y, r) {
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(x, y, r * 0.28, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function motifSnow(g, x, y, r) {
  g.save();
  g.lineWidth = Math.max(1.5, r / 4);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    const bx = x + Math.cos(a) * r * 0.6;
    const by = y + Math.sin(a) * r * 0.6;
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a + 0.8) * r * 0.35, by + Math.sin(a + 0.8) * r * 0.35);
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a - 0.8) * r * 0.35, by + Math.sin(a - 0.8) * r * 0.35);
    g.stroke();
  }
  g.restore();
}

function motifLeaf(g, x, y, r, ang) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(-r, 0);
  g.quadraticCurveTo(0, -r * 0.7, r, 0);
  g.quadraticCurveTo(0, r * 0.7, -r, 0);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------------
//  Contorno del papel: recorre el borde (rectángulo redondeado o círculo)
//  y da puntos con su normal hacia dentro, para colocar motivos.
// ---------------------------------------------------------------------
function shapeBox(area, H, round, inset) {
  if (round) {
    const r = Math.min(area.w, H) / 2 - inset;
    return { round: true, cx: area.cx, cy: H / 2, r };
  }
  return { round: false, x: area.x0 + inset, y: inset, w: area.w - inset * 2, h: H - inset * 2 };
}

function tracePath(g, box, radius = 0) {
  g.beginPath();
  if (box.round) {
    g.arc(box.cx, box.cy, box.r, 0, Math.PI * 2);
    return;
  }
  const r = Math.min(radius, box.w / 2, box.h / 2);
  if (r <= 0) {
    g.rect(box.x, box.y, box.w, box.h);
    return;
  }
  g.moveTo(box.x + r, box.y);
  g.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
  g.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
  g.arcTo(box.x, box.y + box.h, box.x, box.y, r);
  g.arcTo(box.x, box.y, box.x + box.w, box.y, r);
  g.closePath();
}

// Muestras cada ~1 px por el borde (sentido horario) con normal interior.
function perimeterSamples(box, radius = 0) {
  const pts = [];
  if (box.round) {
    const n = Math.max(60, Math.round(2 * Math.PI * box.r));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      pts.push({ x: box.cx + Math.cos(a) * box.r, y: box.cy + Math.sin(a) * box.r, nx: -Math.cos(a), ny: -Math.sin(a) });
    }
    return pts;
  }
  const r = Math.min(radius, box.w / 2, box.h / 2);
  const { x, y, w, h } = box;
  const seg = (x0, y0, x1, y1, nx, ny) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(L));
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, nx, ny });
  };
  const arc = (cx, cy, a0) => {
    const n = Math.max(2, Math.round((Math.PI / 2) * r));
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: -Math.cos(a), ny: -Math.sin(a) });
    }
  };
  seg(x + r, y, x + w - r, y, 0, 1);
  if (r) arc(x + w - r, y + r, -Math.PI / 2);
  seg(x + w, y + r, x + w, y + h - r, -1, 0);
  if (r) arc(x + w - r, y + h - r, 0);
  seg(x + w - r, y + h, x + r, y + h, 0, -1);
  if (r) arc(x + r, y + h - r, Math.PI / 2);
  seg(x, y + h - r, x, y + r, 1, 0);
  if (r) arc(x + r, y + r, Math.PI);
  return pts;
}

// Reparte n posiciones equidistantes por el borde
function spacedPoints(pts, spacing) {
  const n = Math.max(4, Math.round(pts.length / spacing));
  const out = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.floor((i * pts.length) / n)]);
  return out;
}

function strokeOffsetPath(g, pts, offsetFn) {
  g.beginPath();
  pts.forEach((p, i) => {
    const o = offsetFn(i, p);
    const X = p.x + p.nx * o;
    const Y = p.y + p.ny * o;
    i ? g.lineTo(X, Y) : g.moveTo(X, Y);
  });
  g.closePath();
  g.stroke();
}

// ---------------------------------------------------------------------
//  MARCOS
// ---------------------------------------------------------------------
const FRAMES = [
  { id: "linea", name: "Línea", draw: (g, b) => { g.lineWidth = 3; tracePath(g, b); g.stroke(); } },
  { id: "fina", name: "Fina", draw: (g, b) => { g.lineWidth = 2; tracePath(g, b, 6); g.stroke(); } },
  { id: "grueso", name: "Gruesa", draw: (g, b) => { g.lineWidth = 8; tracePath(g, shrink(b, 2)); g.stroke(); } },
  {
    id: "doble", name: "Doble",
    draw: (g, b) => { g.lineWidth = 3; tracePath(g, b); g.stroke(); g.lineWidth = 1.5; tracePath(g, shrink(b, 7)); g.stroke(); }
  },
  { id: "redondeado", name: "Redondeada", draw: (g, b) => { g.lineWidth = 4; tracePath(g, b, 22); g.stroke(); } },
  {
    id: "discontinuo", name: "Discontinua",
    draw: (g, b) => { g.lineWidth = 3; g.setLineDash([12, 8]); tracePath(g, b, 10); g.stroke(); g.setLineDash([]); }
  },
  {
    id: "recortar", name: "Para recortar ✂",
    draw: (g, b) => {
      g.lineWidth = 2; g.setLineDash([6, 6]); tracePath(g, b); g.stroke(); g.setLineDash([]);
      if (!b.round) { g.font = fontN(16); g.textBaseline = "middle"; g.fillText("✂", b.x + 8, b.y); }
    }
  },
  {
    id: "puntos", name: "Puntos",
    draw: (g, b) => { for (const p of spacedPoints(perimeterSamples(b, 10), 12)) { g.beginPath(); g.arc(p.x, p.y, 2.6, 0, 7); g.fill(); } }
  },
  {
    id: "ondas", name: "Ondas",
    draw: (g, b) => {
      g.lineWidth = 2.5;
      const pts = perimeterSamples(shrink(b, 4), 14);
      const k = Math.max(8, Math.round(pts.length / 26));
      strokeOffsetPath(g, pts, (i) => 3.5 * Math.sin((i / pts.length) * k * Math.PI * 2));
    }
  },
  {
    id: "zigzag", name: "Zigzag",
    draw: (g, b) => {
      g.lineWidth = 2.5;
      const pts = perimeterSamples(shrink(b, 4), 0);
      const n = Math.max(12, Math.round(pts.length / 14));
      strokeOffsetPath(g, pts, (i) => { const t = ((i / pts.length) * n) % 1; return 4 * (Math.abs(t - 0.5) * 4 - 1); });
    }
  },
  {
    id: "feston", name: "Festón",
    draw: (g, b) => {
      g.lineWidth = 2.5;
      const pts = perimeterSamples(shrink(b, 6), 0);
      const n = Math.max(12, Math.round(pts.length / 18));
      strokeOffsetPath(g, pts, (i) => -6 * Math.abs(Math.sin(((i / pts.length) * n) * Math.PI)));
    }
  },
  {
    id: "ticket", name: "Ticket",
    draw: (g, b) => {
      if (b.round) { g.lineWidth = 3; tracePath(g, b); g.stroke(); return; }
      const r = Math.min(16, b.h / 5);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x + r, b.y);
      g.lineTo(b.x + b.w - r, b.y);
      g.arc(b.x + b.w, b.y, r, Math.PI, Math.PI / 2, true);
      g.lineTo(b.x + b.w, b.y + b.h - r);
      g.arc(b.x + b.w, b.y + b.h, r, -Math.PI / 2, Math.PI, true);
      g.lineTo(b.x + r, b.y + b.h);
      g.arc(b.x, b.y + b.h, r, 0, -Math.PI / 2, true);
      g.lineTo(b.x, b.y + r);
      g.arc(b.x, b.y, r, Math.PI / 2, 0, true);
      g.stroke();
      g.setLineDash([5, 5]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(b.x + b.w * 0.75, b.y + 6); g.lineTo(b.x + b.w * 0.75, b.y + b.h - 6); g.stroke();
      g.setLineDash([]);
    }
  },
  {
    id: "sello", name: "Sello postal",
    draw: (g, b) => {
      g.lineWidth = 2; tracePath(g, shrink(b, 8)); g.stroke();
      g.save(); g.globalCompositeOperation = "source-over";
      for (const p of spacedPoints(perimeterSamples(b, 0), 11)) { g.beginPath(); g.arc(p.x, p.y, 3.2, 0, 7); g.fill(); }
      g.restore();
    }
  },
  {
    id: "esquinas", name: "Esquinas",
    draw: (g, b) => {
      g.lineWidth = 3;
      if (b.round) { g.lineWidth = 2; tracePath(g, b); g.stroke(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 - Math.PI / 4; motifStar(g, b.cx + Math.cos(a) * (b.r - 10), b.cy + Math.sin(a) * (b.r - 10), 7); } return; }
      const L = Math.min(34, b.w / 4, b.h / 3);
      const c = [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x + b.w, b.y + b.h, -1, -1], [b.x, b.y + b.h, 1, -1]];
      for (const [x, y, sx, sy] of c) {
        g.beginPath(); g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); g.stroke();
        g.beginPath(); g.arc(x + sx * 9, y + sy * 9, 4, 0, 7); g.fill();
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x + sx * (L + 6), y + sy * 5); g.lineTo(x + sx * 5, y + sy * 5); g.lineTo(x + sx * 5, y + sy * (L + 6)); g.stroke();
        g.lineWidth = 3;
      }
    }
  },
  { id: "estrellas", name: "Estrellas", draw: (g, b) => { for (const p of spacedPoints(perimeterSamples(shrink(b, 6), 12), 22)) motifStar(g, p.x, p.y, 6.5); } },
  { id: "corazones", name: "Corazones", draw: (g, b) => { for (const p of spacedPoints(perimeterSamples(shrink(b, 6), 12), 22)) motifHeart(g, p.x, p.y, 6); } },
  { id: "flores", name: "Flores", draw: (g, b) => { for (const p of spacedPoints(perimeterSamples(shrink(b, 7), 12), 24)) motifFlower(g, p.x, p.y, 7.5); } },
  { id: "copos", name: "Copos de nieve", draw: (g, b) => { for (const p of spacedPoints(perimeterSamples(shrink(b, 7), 12), 26)) motifSnow(g, p.x, p.y, 7); } },
  {
    id: "hojas", name: "Hojas",
    draw: (g, b) => {
      g.lineWidth = 1.5; const bb = shrink(b, 7); tracePath(g, bb, 12); g.stroke();
      const pts = spacedPoints(perimeterSamples(bb, 12), 16);
      pts.forEach((p, i) => motifLeaf(g, p.x + p.nx * (i % 2 ? 4 : -4), p.y + p.ny * (i % 2 ? 4 : -4), 6, Math.atan2(p.ny, p.nx) + Math.PI / 2 + (i % 2 ? 0.6 : -0.6)));
    }
  },
  {
    id: "cuerda", name: "Cuerda",
    draw: (g, b) => {
      g.lineWidth = 2;
      const pts = perimeterSamples(shrink(b, 5), 12);
      for (const p of spacedPoints(pts, 7)) {
        const tx = -p.ny, ty = p.nx;
        g.beginPath();
        g.moveTo(p.x - tx * 4 - p.nx * 4, p.y - ty * 4 - p.ny * 4);
        g.lineTo(p.x + tx * 4 + p.nx * 4, p.y + ty * 4 + p.ny * 4);
        g.stroke();
      }
    }
  },
  {
    id: "ajedrez", name: "Ajedrez",
    draw: (g, b) => {
      const s = 7;
      const pts = spacedPoints(perimeterSamples(shrink(b, s), 0), s);
      pts.forEach((p, i) => {
        if (i % 2) return;
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.ny, p.nx));
        g.fillRect(-s, -s / 2, s, s); g.restore();
      });
    }
  },
  {
    id: "pelicula", name: "Película",
    draw: (g, b) => {
      if (b.round) { g.lineWidth = 10; tracePath(g, shrink(b, 3)); g.stroke(); g.fillStyle = "#fff"; for (const p of spacedPoints(perimeterSamples(shrink(b, 3), 0), 14)) g.fillRect(p.x - 2, p.y - 2, 4, 4); return; }
      const band = Math.min(18, b.h / 6);
      g.fillRect(b.x, b.y, b.w, band); g.fillRect(b.x, b.y + b.h - band, b.w, band);
      g.fillStyle = "#fff";
      for (let x = b.x + 8; x < b.x + b.w - 8; x += 16) { g.fillRect(x, b.y + band / 2 - 3, 8, 6); g.fillRect(x, b.y + b.h - band / 2 - 3, 8, 6); }
    }
  },
  {
    id: "banderines", name: "Banderines",
    draw: (g, b) => {
      g.lineWidth = 2; tracePath(g, b, 8); g.stroke();
      if (b.round) return;
      const n = Math.max(4, Math.round(b.w / 34)), step = b.w / n;
      g.beginPath(); g.moveTo(b.x, b.y + 4);
      for (let i = 0; i <= n; i++) g.quadraticCurveTo(b.x + step * (i - 0.5), b.y + 10, b.x + step * i, b.y + 4);
      g.stroke();
      for (let i = 0; i < n; i++) {
        const x0 = b.x + step * i + 3, x1 = b.x + step * (i + 1) - 3;
        g.beginPath(); g.moveTo(x0, b.y + 6); g.lineTo(x1, b.y + 6); g.lineTo((x0 + x1) / 2, b.y + 24); g.closePath();
        i % 2 ? g.fill() : g.stroke();
      }
    }
  },
  {
    id: "nube", name: "Nube",
    draw: (g, b) => {
      g.lineWidth = 2.5;
      const pts = perimeterSamples(shrink(b, 8), 20);
      const n = Math.max(10, Math.round(pts.length / 22));
      strokeOffsetPath(g, pts, (i) => -7 * Math.pow(Math.abs(Math.sin(((i / pts.length) * n) * Math.PI)), 0.6));
    }
  },
  {
    id: "etiqueta", name: "Etiqueta colgante",
    draw: (g, b) => {
      if (b.round) { g.lineWidth = 3; tracePath(g, b); g.stroke(); g.beginPath(); g.arc(b.cx, b.cy - b.r + 14, 5, 0, 7); g.stroke(); return; }
      const t = Math.min(30, b.w / 6);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x + t, b.y); g.lineTo(b.x + b.w - 6, b.y); g.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + 6);
      g.lineTo(b.x + b.w, b.y + b.h - 6); g.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - 6, b.y + b.h);
      g.lineTo(b.x + t, b.y + b.h); g.lineTo(b.x, b.y + b.h / 2); g.closePath(); g.stroke();
      g.beginPath(); g.arc(b.x + t * 0.75, b.y + b.h / 2, 5, 0, 7); g.stroke();
    }
  },
  {
    id: "navidad", name: "Navidad",
    draw: (g, b) => {
      const pts = spacedPoints(perimeterSamples(shrink(b, 7), 12), 22);
      pts.forEach((p, i) => (i % 3 === 0 ? motifStar(g, p.x, p.y, 6.5) : i % 3 === 1 ? motifSnow(g, p.x, p.y, 6) : (g.beginPath(), g.arc(p.x, p.y, 3, 0, 7), g.fill())));
    }
  }
];

function shrink(b, d) {
  return b.round ? { ...b, r: b.r - d } : { ...b, x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d };
}

// Lo llama renderScene (app.js) después del texto y el dibujo.
function drawFrame(g, styleId, area, H, round) {
  const f = FRAMES.find((x) => x.id === styleId);
  if (!f) return;
  g.save();
  g.fillStyle = "#000";
  g.strokeStyle = "#000";
  g.lineJoin = "round";
  g.lineCap = "round";
  f.draw(g, shapeBox(area, H, round, 4));
  g.restore();
}

// ---------------------------------------------------------------------
//  CÓDIGOS: QR (librería qrcode-generator, MIT) y de barras (Code128 / EAN-13)
// ---------------------------------------------------------------------
function renderQR(text, caption, W, H) {
  if (typeof qrcode !== "function") throw new Error("Falta la librería de QR");
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  const capH = caption ? 26 : 0;
  const quiet = 2;
  const avail = Math.min(W, (H || W + capH) - capH);
  const mod = Math.max(2, Math.floor(avail / (n + quiet * 2)));
  const side = mod * (n + quiet * 2);
  const { c, g } = makeCanvas(W, H || side + capH);
  const ox = Math.round((W - side) / 2);
  const oy = Math.round(((H || side + capH) - side - capH) / 2);
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (q.isDark(r, col)) g.fillRect(ox + (col + quiet) * mod, oy + (r + quiet) * mod, mod, mod);
  if (caption) {
    g.font = fontB(18);
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(caption, W / 2, oy + side + 2, W - 8);
  }
  return c;
}

const CODE128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

// Devuelve la lista de anchos (barra, espacio, barra…) en módulos.
function encodeCode128(text) {
  const codes = [];
  const allDigits = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4;
  if (allDigits) {
    codes.push(105);
    for (let i = 0; i < text.length; i += 2) codes.push(Number(text.substr(i, 2)));
  } else {
    codes.push(104);
    for (const ch of text) {
      const v = ch.charCodeAt(0) - 32;
      if (v < 0 || v > 95) throw new Error(`Carácter no válido en Code128: «${ch}»`);
      codes.push(v);
    }
  }
  let sum = codes[0];
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106);
  return codes.map((c) => CODE128[c]).join("").split("").map(Number);
}

const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_PAR = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function eanCheck(d12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}

// Devuelve los módulos como cadena de 0/1 (95 módulos)
function encodeEAN13(text) {
  let d = text.replace(/\D/g, "");
  if (d.length === 12) d += eanCheck(d);
  if (d.length !== 13) throw new Error("EAN-13 necesita 12 o 13 cifras");
  if (Number(d[12]) !== eanCheck(d.slice(0, 12))) throw new Error("El dígito de control del EAN-13 no es correcto");
  const R = (x) => x.split("").map((b) => (b === "1" ? "0" : "1")).join("");
  let bits = "101";
  const par = EAN_PAR[Number(d[0])];
  for (let i = 1; i <= 6; i++) {
    const L = EAN_L[Number(d[i])];
    bits += par[i - 1] === "L" ? L : R(L).split("").reverse().join("");
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R(EAN_L[Number(d[i])]);
  bits += "101";
  return { bits, digits: d };
}

function renderBarcode(text, type, W, H) {
  const totalH = H || 150;
  const { c, g } = makeCanvas(W, totalH);
  let mods;
  let label = text;
  if (type === "ean13") {
    const e = encodeEAN13(text);
    mods = e.bits;
    label = e.digits;
  } else {
    const widths = encodeCode128(text);
    mods = "";
    widths.forEach((wd, i) => (mods += (i % 2 ? "0" : "1").repeat(wd)));
  }
  const quiet = 10;
  const unit = Math.max(1, Math.floor(W / (mods.length + quiet * 2)));
  if (unit < 2) toast("El código es muy largo para este ancho: puede costar leerlo.", "warn", 5000);
  const bw = unit * mods.length;
  const ox = Math.round((W - bw) / 2);
  const textH = 24;
  const barH = Math.max(30, totalH - textH - 12);
  for (let i = 0; i < mods.length; i++) if (mods[i] === "1") g.fillRect(ox + i * unit, 6, unit, barH);
  g.font = fontB(18);
  g.textAlign = "center";
  g.textBaseline = "top";
  g.fillText(label, W / 2, barH + 9, W - 8);
  return c;
}

// ---------------------------------------------------------------------
//  CALENDARIOS
// ---------------------------------------------------------------------
const MESES_C = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function renderMonth(year, month, W, H, opts = {}) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const rows = Math.ceil((offset + days) / 7);
  const titleH = H ? Math.max(18, Math.round(H * 0.14)) : 40;
  const headH = H ? Math.max(12, Math.round(H * 0.09)) : 24;
  const cellW = (W - 8) / 7;
  const cellH = H ? (H - titleH - headH - 6) / rows : Math.round(cellW * (opts.notes ? 1.05 : 0.72));
  const totalH = H || Math.round(titleH + headH + cellH * rows + 8);
  const { c, g } = makeCanvas(W, totalH);
  const today = new Date();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = fontB(Math.round(titleH * 0.72));
  g.fillText(`${MESES_C[month]} ${year}`, W / 2, titleH / 2 + 1);
  g.font = fontB(Math.round(headH * 0.72));
  DIAS_CORTOS.forEach((d, i) => g.fillText(d, 4 + cellW * (i + 0.5), titleH + headH / 2));
  const top = titleH + headH;
  g.lineWidth = 1.5;
  for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(4, top + r * cellH); g.lineTo(W - 4, top + r * cellH); g.stroke(); }
  for (let k = 0; k <= 7; k++) { g.beginPath(); g.moveTo(4 + k * cellW, top); g.lineTo(4 + k * cellW, top + rows * cellH); g.stroke(); }
  const fs = Math.max(10, Math.round(Math.min(cellH * (opts.notes ? 0.36 : 0.55), cellW * 0.5)));
  for (let d = 1; d <= days; d++) {
    const idx = offset + d - 1;
    const col = idx % 7, row = Math.floor(idx / 7);
    const x = 4 + col * cellW, y = top + row * cellH;
    g.font = col >= 5 ? fontB(fs) : fontN(fs);
    if (opts.notes) { g.textAlign = "left"; g.textBaseline = "top"; g.fillText(String(d), x + 3, y + 2); g.textAlign = "center"; g.textBaseline = "middle"; }
    else g.fillText(String(d), x + cellW / 2, y + cellH / 2 + 1);
    if (opts.markToday && sameDay(new Date(year, month, d), today)) {
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(x + cellW / 2, y + cellH / 2, cellW * 0.42, cellH * 0.42, 0, 0, 7);
      g.stroke();
      g.lineWidth = 1.5;
    }
  }
  return c;
}

function mondayOf(d) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

function renderWeek(startDate, W, H) {
  const mon = mondayOf(startDate);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const titleH = H ? Math.max(18, Math.round(H * 0.12)) : 36;
  const rowH = H ? (H - titleH - 4) / 7 : 64;
  const totalH = H || Math.round(titleH + rowH * 7 + 6);
  const { c, g } = makeCanvas(W, totalH);
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.font = fontB(Math.round(titleH * 0.6));
  const t = mon.getMonth() === sun.getMonth()
    ? `Semana del ${mon.getDate()} al ${sun.getDate()} de ${MESES[sun.getMonth()]}`
    : `Semana del ${mon.getDate()} ${MESES[mon.getMonth()].slice(0, 3)} al ${sun.getDate()} ${MESES[sun.getMonth()].slice(0, 3)}`;
  g.fillText(t, W / 2, titleH / 2, W - 8);
  g.textAlign = "left";
  const lab = Math.min(110, W * 0.3);
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const y = titleH + i * rowH;
    g.lineWidth = i ? 1.5 : 2.5;
    g.beginPath(); g.moveTo(4, y); g.lineTo(W - 4, y); g.stroke();
    g.font = fontB(Math.max(10, Math.round(Math.min(rowH * 0.34, 20))));
    g.fillText(`${DIAS_LARGOS[i]} ${d.getDate()}`, 8, y + Math.min(rowH * 0.3, 16), lab - 8);
    if (rowH > 40) {
      g.lineWidth = 1;
      g.setLineDash([2, 4]);
      for (let k = 1; k < Math.floor(rowH / 22); k++) { g.beginPath(); g.moveTo(lab, y + k * 22 + 6); g.lineTo(W - 6, y + k * 22 + 6); g.stroke(); }
      g.setLineDash([]);
    }
  }
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(4, titleH + 7 * rowH); g.lineTo(W - 4, titleH + 7 * rowH); g.stroke();
  return c;
}

function renderHabits(year, month, W, H, habits) {
  const days = new Date(year, month + 1, 0).getDate();
  const list = habits.length ? habits : ["Agua", "Leer", "Ejercicio"];
  const titleH = 34;
  const nameW = Math.min(110, W * 0.3);
  const perRow = 16;
  const blocks = Math.ceil(days / perRow);
  const cell = Math.floor((W - nameW - 8) / perRow);
  const rowH = cell + 4;
  const blockH = 16 + rowH * list.length + 8;
  const totalH = H || titleH + blocks * blockH;
  const { c, g } = makeCanvas(W, totalH);
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.font = fontB(20);
  g.fillText(`Hábitos · ${MESES[month]} ${year}`, W / 2, titleH / 2);
  for (let b = 0; b < blocks; b++) {
    const y0 = titleH + b * blockH;
    g.font = fontN(10);
    for (let k = 0; k < perRow; k++) {
      const d = b * perRow + k + 1;
      if (d > days) break;
      g.fillText(String(d), nameW + 4 + k * cell + cell / 2, y0 + 7);
    }
    list.forEach((h, i) => {
      const y = y0 + 16 + i * rowH;
      g.textAlign = "left";
      g.font = fontB(14);
      g.fillText(h, 6, y + cell / 2, nameW - 10);
      g.textAlign = "center";
      g.lineWidth = 1.5;
      for (let k = 0; k < perRow; k++) {
        if (b * perRow + k + 1 > days) break;
        g.strokeRect(nameW + 4 + k * cell + 1.5, y + 1.5, cell - 3, cell - 3);
      }
    });
  }
  return c;
}

// ---------------------------------------------------------------------
//  JUEGOS: crucigrama, sopa de letras y laberinto
// ---------------------------------------------------------------------
const THEMES = {
  animales: { name: "Animales", words: [["GATO", "Maúlla y caza ratones"], ["PERRO", "El mejor amigo del hombre"], ["VACA", "Nos da leche"], ["LEON", "El rey de la selva"], ["PATO", "Hace cuac"], ["OVEJA", "Nos da lana"], ["CABALLO", "Galopa y relincha"], ["RANA", "Salta y croa"], ["TIGRE", "Felino a rayas"], ["BURRO", "Rebuzna"], ["CERDO", "Hace oinc"], ["JIRAFA", "Tiene el cuello muy largo"], ["ELEFANTE", "Tiene trompa"], ["TORTUGA", "Lleva su casa a cuestas"]] },
  frutas: { name: "Frutas", words: [["MANZANA", "Roja o verde, la mordió Blancanieves"], ["PERA", "Fruta con forma de bombilla"], ["UVA", "Se come en Nochevieja"], ["PLATANO", "Amarillo y de Canarias"], ["NARANJA", "Del color de su nombre"], ["FRESA", "Roja con semillas por fuera"], ["MELON", "Grande, de verano"], ["SANDIA", "Verde por fuera y roja por dentro"], ["KIWI", "Peludo y verde por dentro"], ["LIMON", "Amarillo y ácido"], ["CEREZA", "Pequeña, roja y con hueso"], ["PIÑA", "Tiene corona"]] },
  casa: { name: "La casa", words: [["MESA", "Donde comemos"], ["SILLA", "Para sentarse"], ["CAMA", "Donde dormimos"], ["PUERTA", "Se abre para entrar"], ["VENTANA", "Deja pasar la luz"], ["COCINA", "Donde se hace la comida"], ["SOFA", "Mueble del salón"], ["LAMPARA", "Da luz"], ["ESPEJO", "Nos refleja"], ["DUCHA", "Para lavarnos"], ["ARMARIO", "Guarda la ropa"], ["TEJADO", "Cubre la casa"]] },
  naturaleza: { name: "Naturaleza", words: [["ARBOL", "Tiene tronco y ramas"], ["FLOR", "Huele bien y tiene pétalos"], ["RIO", "Agua que corre hasta el mar"], ["MAR", "Agua salada"], ["SOL", "Estrella que nos calienta"], ["LUNA", "Brilla de noche"], ["NUBE", "Trae la lluvia"], ["MONTAÑA", "Muy alta, a veces con nieve"], ["BOSQUE", "Muchos árboles juntos"], ["PLAYA", "Arena junto al mar"], ["LLUVIA", "Agua que cae del cielo"], ["VIENTO", "Mueve las hojas"]] },
  cocina: { name: "Cocina", words: [["SARTEN", "Para freír"], ["OLLA", "Para guisos"], ["CUCHARA", "Para la sopa"], ["TENEDOR", "Tiene púas"], ["PLATO", "Donde se sirve la comida"], ["VASO", "Para beber"], ["HORNO", "Para asar"], ["NEVERA", "Mantiene todo fresco"], ["SAL", "Condimento blanco"], ["ACEITE", "De oliva, el mejor"], ["HARINA", "Para hacer pan"], ["HUEVO", "Lo pone la gallina"]] },
  deportes: { name: "Deportes", words: [["FUTBOL", "Once contra once"], ["TENIS", "Raqueta y pelota amarilla"], ["NATACION", "En la piscina"], ["CICLISMO", "Sobre dos ruedas"], ["BALONCESTO", "Canasta"], ["GOLF", "Hoyo en uno"], ["ESQUI", "Sobre la nieve"], ["KARATE", "Arte marcial japonés"], ["RUGBY", "Balón ovalado"], ["SURF", "Sobre las olas"], ["BOXEO", "Con guantes"], ["CARRERA", "A ver quién llega antes"]] },
  colores: { name: "Colores", words: [["ROJO", "Color de la sangre"], ["AZUL", "Color del cielo"], ["VERDE", "Color de la hierba"], ["AMARILLO", "Color del sol"], ["NEGRO", "Color de la noche"], ["BLANCO", "Color de la nieve"], ["ROSA", "Flor y color"], ["MORADO", "Mezcla de rojo y azul"], ["GRIS", "Color de las nubes de tormenta"], ["MARRON", "Color del chocolate"], ["NARANJA", "Fruta y color"]] }
};

function parseCustomWords(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [w, ...rest] = l.split(/[:=-]/);
      return [w.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-ZÑ]/g, ""), rest.join(":").trim() || "Sin pista"];
    })
    .filter(([w]) => w.length >= 2);
}

function buildCrossword(list, seed, maxCols = 15) {
  let best = null;
  const R = rng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const words = [...list].sort((a, b) => b[0].length - a[0].length + (R() - 0.5) * 3);
    const grid = new Map();
    const placed = [];
    const key = (x, y) => `${x},${y}`;
    const fits = (w, x, y, dir) => {
      const dx = dir ? 0 : 1, dy = dir ? 1 : 0;
      if (grid.has(key(x - dx, y - dy)) || grid.has(key(x + dx * w.length, y + dy * w.length))) return -1;
      let cross = 0;
      for (let i = 0; i < w.length; i++) {
        const cx = x + dx * i, cy = y + dy * i;
        const cur = grid.get(key(cx, cy));
        if (cur) {
          if (cur.ch !== w[i] || cur[dir ? "d" : "a"]) return -1;
          cross++;
        } else if (grid.has(key(cx + dy, cy + dx)) || grid.has(key(cx - dy, cy - dx))) return -1;
      }
      return cross;
    };
    const put = (w, clue, x, y, dir) => {
      const dx = dir ? 0 : 1, dy = dir ? 1 : 0;
      for (let i = 0; i < w.length; i++) {
        const k = key(x + dx * i, y + dy * i);
        const cell = grid.get(k) || { ch: w[i] };
        cell[dir ? "d" : "a"] = true;
        grid.set(k, cell);
      }
      placed.push({ w, clue, x, y, dir });
    };
    const bounds = () => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const k of grid.keys()) { const [x, y] = k.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1 };
    };
    put(words[0][0], words[0][1], 0, 0, 0);
    for (const [w, clue] of words.slice(1)) {
      let cand = [];
      for (const [k, cell] of grid) {
        const [gx, gy] = k.split(",").map(Number);
        for (let i = 0; i < w.length; i++) {
          if (w[i] !== cell.ch) continue;
          for (const dir of [0, 1]) {
            if (cell[dir ? "d" : "a"]) continue;
            const x = dir ? gx : gx - i, y = dir ? gy - i : gy;
            const sc = fits(w, x, y, dir);
            if (sc > 0) {
              const b = bounds();
              const nx0 = Math.min(b.x0, x), nx1 = Math.max(b.x1, x + (dir ? 0 : w.length - 1));
              const ny0 = Math.min(b.y0, y), ny1 = Math.max(b.y1, y + (dir ? w.length - 1 : 0));
              if (nx1 - nx0 + 1 > maxCols) continue;
              cand.push({ x, y, dir, sc: sc * 10 - (nx1 - nx0 + ny1 - ny0) * 0.3 + R() });
            }
          }
        }
      }
      if (cand.length) {
        cand.sort((a, b) => b.sc - a.sc);
        put(w, clue, cand[0].x, cand[0].y, cand[0].dir);
      }
    }
    const b = bounds();
    const score = placed.length * 100 - (b.x1 - b.x0 + b.y1 - b.y0);
    if (!best || score > best.score) best = { score, placed, grid, b };
  }
  return best;
}

function renderCrossword(list, seed, W, withSolution) {
  const cw = buildCrossword(list, seed);
  const { placed, b } = cw;
  const cols = b.x1 - b.x0 + 1, rows = b.y1 - b.y0 + 1;
  const cell = Math.min(34, Math.floor((W - 8) / cols));
  const gridW = cell * cols, gridH = cell * rows;
  // Numeración en orden de lectura
  const starts = new Map();
  let num = 0;
  const sorted = [...placed].sort((p, q) => p.y - q.y || p.x - q.x);
  for (const p of sorted) { const k = `${p.x},${p.y}`; if (!starts.has(k)) starts.set(k, ++num); p.n = starts.get(k); }
  const g0 = makeCanvas(10, 10).g;
  const clueFont = 15;
  g0.font = fontN(clueFont);
  const across = sorted.filter((p) => !p.dir).sort((p, q) => p.n - q.n);
  const down = sorted.filter((p) => p.dir).sort((p, q) => p.n - q.n);
  const clueLines = [];
  const addClues = (title, arr) => {
    clueLines.push({ t: title, b: true });
    for (const p of arr) for (const [i, l] of wrapWords(g0, `${p.n}. ${p.clue} (${p.w.length})`, W - 16).entries()) clueLines.push({ t: (i ? "    " : "") + l });
  };
  addClues("Horizontales", across);
  addClues("Verticales", down);
  const lineH = 19;
  const solH = withSolution ? Math.ceil(gridH * 0.5) + 30 : 0;
  const H = 12 + gridH + 14 + clueLines.length * lineH + 8 + solH;
  const { c, g } = makeCanvas(W, H);
  const ox = Math.round((W - gridW) / 2), oy = 8;
  const drawGrid = (x0, y0, size, letters) => {
    for (const [k, cl] of cw.grid) {
      const [x, y] = k.split(",").map(Number);
      const px = x0 + (x - b.x0) * size, py = y0 + (y - b.y0) * size;
      g.lineWidth = 2;
      g.strokeRect(px, py, size, size);
      if (letters) { g.font = fontB(Math.round(size * 0.62)); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(cl.ch, px + size / 2, py + size / 2 + 1); }
      else if (starts.has(k)) { g.font = fontB(Math.max(9, Math.round(size * 0.32))); g.textAlign = "left"; g.textBaseline = "top"; g.fillText(String(starts.get(k)), px + 2, py + 1); }
    }
  };
  drawGrid(ox, oy, cell, false);
  let y = oy + gridH + 14;
  g.textAlign = "left";
  g.textBaseline = "top";
  for (const l of clueLines) { g.font = l.b ? fontB(16) : fontN(clueFont); g.fillText(l.t, 8, y); y += lineH; }
  if (withSolution) {
    const s = Math.max(10, Math.floor(cell * 0.5));
    y += 8;
    g.font = fontB(13);
    g.fillText("Solución:", 8, y);
    drawGrid(Math.round((W - s * cols) / 2), y + 18, s, true);
  }
  return c;
}

const DIRS_EASY = [[1, 0], [0, 1]];
const DIRS_MED = [[1, 0], [0, 1], [1, 1], [1, -1]];
const DIRS_HARD = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];

function renderWordSearch(list, seed, W, level = "medio") {
  const R = rng(seed);
  const words = list.map((x) => x[0]).filter((w) => w.length <= 13).slice(0, 12);
  const n = Math.min(14, Math.max(9, Math.max(...words.map((w) => w.length)) + 2));
  const dirs = level === "facil" ? DIRS_EASY : level === "dificil" ? DIRS_HARD : DIRS_MED;
  const grid = Array.from({ length: n }, () => Array(n).fill(""));
  const used = [];
  for (const w of words) {
    for (let t = 0; t < 200; t++) {
      const [dx, dy] = dirs[Math.floor(R() * dirs.length)];
      const x = Math.floor(R() * n), y = Math.floor(R() * n);
      const ex = x + dx * (w.length - 1), ey = y + dy * (w.length - 1);
      if (ex < 0 || ey < 0 || ex >= n || ey >= n) continue;
      let ok = true;
      for (let i = 0; i < w.length; i++) { const c0 = grid[y + dy * i][x + dx * i]; if (c0 && c0 !== w[i]) { ok = false; break; } }
      if (!ok) continue;
      for (let i = 0; i < w.length; i++) grid[y + dy * i][x + dx * i] = w[i];
      used.push(w);
      break;
    }
  }
  const ABC = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!grid[y][x]) grid[y][x] = ABC[Math.floor(R() * ABC.length)];
  const cell = Math.floor((W - 12) / n);
  const gw = cell * n;
  const colsW = 2;
  const listRows = Math.ceil(used.length / colsW);
  const H = 10 + gw + 16 + listRows * 22 + 10;
  const { c, g } = makeCanvas(W, H);
  const ox = Math.round((W - gw) / 2), oy = 8;
  g.lineWidth = 2;
  g.strokeRect(ox - 2, oy - 2, gw + 4, gw + 4);
  g.font = fontB(Math.round(cell * 0.62));
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.fillText(grid[y][x], ox + x * cell + cell / 2, oy + y * cell + cell / 2 + 1);
  g.font = fontB(15);
  g.textAlign = "left";
  g.textBaseline = "top";
  used.sort().forEach((w, i) => {
    const col = i % colsW, row = Math.floor(i / colsW);
    const x = 10 + col * ((W - 20) / colsW), y = oy + gw + 16 + row * 22;
    g.lineWidth = 1.5;
    g.strokeRect(x, y + 2, 13, 13);
    g.fillText(w, x + 20, y);
  });
  return c;
}

function renderMaze(seed, W, H) {
  const R = rng(seed);
  const totalH = H || W;
  const cell = Math.max(14, Math.round(Math.min(W, totalH) / 14));
  const cols = Math.floor((W - 8) / cell), rows = Math.floor((totalH - 8) / cell);
  const ox = Math.round((W - cols * cell) / 2), oy = Math.round((totalH - rows * cell) / 2);
  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => [true, true, true, true])); // N E S O
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  const D = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = D.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny][nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, w1, w2] = opts[Math.floor(R() * opts.length)];
    walls[y][x][w1] = false;
    walls[y + dy][x + dx][w2] = false;
    seen[y + dy][x + dx] = true;
    stack.push([x + dx, y + dy]);
  }
  walls[0][0][3] = false;
  walls[rows - 1][cols - 1][1] = false;
  const { c, g } = makeCanvas(W, totalH);
  g.lineWidth = 2.5;
  g.lineCap = "square";
  g.beginPath();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = ox + x * cell, py = oy + y * cell, w = walls[y][x];
      if (w[0]) { g.moveTo(px, py); g.lineTo(px + cell, py); }
      if (w[1]) { g.moveTo(px + cell, py); g.lineTo(px + cell, py + cell); }
      if (w[2]) { g.moveTo(px, py + cell); g.lineTo(px + cell, py + cell); }
      if (w[3]) { g.moveTo(px, py); g.lineTo(px, py + cell); }
    }
  g.stroke();
  motifStar(g, ox + cell / 2, oy + cell / 2, cell * 0.3);
  motifHeart(g, ox + (cols - 0.5) * cell, oy + (rows - 0.5) * cell, cell * 0.28);
  return c;
}

// ---------------------------------------------------------------------
//  COLOREAR: mandalas, patrones y figuras (solo contornos)
// ---------------------------------------------------------------------
function renderMandala(seed, W, H) {
  const R = rng(seed);
  const totalH = H || W;
  const { c, g } = makeCanvas(W, totalH);
  const cx = W / 2, cy = totalH / 2;
  const Rmax = Math.min(W, totalH) / 2 - 6;
  const sym = [8, 10, 12, 16][Math.floor(R() * 4)];
  g.lineWidth = 2.2;
  let r0 = Rmax * (0.1 + R() * 0.06);
  g.beginPath(); g.arc(cx, cy, r0, 0, 7); g.stroke();
  motifFlower(g, cx, cy, r0 * 0.7);
  while (r0 < Rmax - 8) {
    const r1 = Math.min(Rmax, r0 + Rmax * (0.12 + R() * 0.12));
    const kind = Math.floor(R() * 6);
    const n = sym * (R() < 0.3 ? 2 : 1);
    g.beginPath(); g.arc(cx, cy, r1, 0, 7); g.stroke();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2, am = (a + a2) / 2;
      const P = (r, ang) => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
      g.beginPath();
      if (kind === 0) { // pétalos
        g.moveTo(...P(r0, a)); g.quadraticCurveTo(...P(r1 * 1.02, am), ...P(r0, a2));
      } else if (kind === 1) { // arcos hacia dentro
        g.moveTo(...P(r1, a)); g.quadraticCurveTo(...P(r0, am), ...P(r1, a2));
      } else if (kind === 2) { // círculos
        const rr = Math.min((r1 - r0) / 2, (Math.PI * (r0 + r1)) / n / 2) * 0.8;
        g.arc(...P((r0 + r1) / 2, am), rr, 0, 7);
      } else if (kind === 3) { // triángulos
        g.moveTo(...P(r0, a)); g.lineTo(...P(r1, am)); g.lineTo(...P(r0, a2));
      } else if (kind === 4) { // gotas
        g.moveTo(...P(r0, am)); g.quadraticCurveTo(...P((r0 + r1) / 2, a + (am - a) * 0.2), ...P(r1, am));
        g.quadraticCurveTo(...P((r0 + r1) / 2, a2 - (a2 - am) * 0.2), ...P(r0, am));
      } else { // radios con puntos
        g.moveTo(...P(r0, a)); g.lineTo(...P(r1, a));
        g.moveTo(...P((r0 + r1) / 2, am)); g.arc(...P((r0 + r1) / 2, am), Math.max(2, (r1 - r0) * 0.12), 0, 7);
      }
      g.stroke();
    }
    r0 = r1;
  }
  return c;
}

function renderPattern(kind, W, H) {
  const totalH = H || W;
  const { c, g } = makeCanvas(W, totalH);
  g.lineWidth = 2;
  const s = 34;
  g.beginPath();
  if (kind === "hex") {
    const h = s * Math.sqrt(3) / 2;
    for (let row = -1; row * h < totalH + s; row++)
      for (let col = -1; col * s * 1.5 < W + s; col++) {
        const x = col * s * 1.5, y = row * h * 2 + (col % 2 ? h : 0);
        for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3; const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      }
  } else if (kind === "escamas") {
    for (let row = 0; row * s * 0.5 < totalH + s; row++)
      for (let col = -1; col * s < W + s; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.5;
        g.moveTo(x + s / 2, y); g.arc(x, y, s / 2, 0, Math.PI);
      }
  } else if (kind === "triangulos") {
    const h = s * Math.sqrt(3) / 2;
    for (let y = 0; y < totalH + h; y += h) { g.moveTo(0, y); g.lineTo(W, y); }
    for (let x = -totalH * 2; x < W + totalH; x += s) { g.moveTo(x, 0); g.lineTo(x + totalH / Math.sqrt(3), totalH); g.moveTo(x, 0); g.lineTo(x - totalH / Math.sqrt(3), totalH); }
  } else if (kind === "ondas") {
    for (let y = 0; y < totalH + s; y += s / 2) { g.moveTo(0, y); for (let x = 0; x <= W; x += 4) g.lineTo(x, y + Math.sin(x / 14 + y) * 7); }
  } else {
    // estrellas y círculos
    for (let y = s / 2; y < totalH; y += s) for (let x = s / 2 + ((y / s) % 2 ? s / 2 : 0); x < W; x += s) { g.moveTo(x + 10, y); g.arc(x, y, 10, 0, 7); }
  }
  g.stroke();
  if (kind === "estrellas") for (let y = s; y < totalH; y += s) for (let x = s + ((y / s) % 2 ? 0 : s / 2); x < W; x += s) motifStar(g, x, y, 6, -Math.PI / 2, false);
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, totalH - 3);
  return c;
}

// Figuras dibujadas en un lienzo de 100×100 y escaladas al papel.
const FIGURES = {
  casa: (g) => {
    g.strokeRect(20, 45, 60, 45); g.beginPath(); g.moveTo(12, 48); g.lineTo(50, 14); g.lineTo(88, 48); g.closePath(); g.stroke();
    g.strokeRect(43, 65, 14, 25); g.strokeRect(26, 54, 12, 12); g.strokeRect(62, 54, 12, 12);
    g.strokeRect(66, 20, 9, 18); g.beginPath(); g.arc(70, 14, 4, 0, 7); g.arc(76, 8, 3, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(5, 90); g.lineTo(95, 90); g.stroke();
  },
  sol: (g) => {
    g.beginPath(); g.arc(50, 50, 20, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; g.beginPath(); g.moveTo(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26); g.lineTo(50 + Math.cos(a + 0.13) * 42, 50 + Math.sin(a + 0.13) * 42); g.lineTo(50 + Math.cos(a - 0.13) * 42, 50 + Math.sin(a - 0.13) * 42); g.closePath(); g.stroke(); }
    g.beginPath(); g.arc(43, 46, 2.5, 0, 7); g.arc(57, 46, 2.5, 0, 7); g.fill();
    g.beginPath(); g.arc(50, 52, 9, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  },
  flor: (g) => {
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.beginPath(); g.ellipse(50 + Math.cos(a) * 16, 38 + Math.sin(a) * 16, 11, 6, a, 0, 7); g.stroke(); }
    g.beginPath(); g.arc(50, 38, 8, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(50, 55); g.quadraticCurveTo(46, 75, 50, 95); g.stroke();
    g.beginPath(); g.moveTo(49, 78); g.quadraticCurveTo(34, 66, 28, 74); g.quadraticCurveTo(38, 82, 49, 78); g.stroke();
    g.beginPath(); g.moveTo(50, 70); g.quadraticCurveTo(66, 60, 72, 68); g.quadraticCurveTo(62, 76, 50, 70); g.stroke();
  },
  pez: (g) => {
    g.beginPath(); g.moveTo(15, 50); g.quadraticCurveTo(45, 18, 72, 50); g.quadraticCurveTo(45, 82, 15, 50); g.stroke();
    g.beginPath(); g.moveTo(70, 50); g.lineTo(90, 34); g.lineTo(90, 66); g.closePath(); g.stroke();
    g.beginPath(); g.arc(28, 46, 3, 0, 7); g.fill();
    g.beginPath(); g.moveTo(40, 34); g.quadraticCurveTo(46, 50, 40, 66); g.moveTo(52, 34); g.quadraticCurveTo(58, 50, 52, 66); g.stroke();
    g.beginPath(); g.arc(12, 30, 3, 0, 7); g.moveTo(10, 20); g.arc(8, 20, 2, 0, 7); g.stroke();
  },
  mariposa: (g) => {
    g.beginPath(); g.ellipse(50, 52, 4, 22, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(48, 31); g.quadraticCurveTo(40, 18, 34, 16); g.moveTo(52, 31); g.quadraticCurveTo(60, 18, 66, 16); g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(50 + s * 4, 45); g.bezierCurveTo(50 + s * 40, 10, 50 + s * 48, 40, 50 + s * 4, 52); g.stroke();
      g.beginPath(); g.moveTo(50 + s * 4, 55); g.bezierCurveTo(50 + s * 36, 58, 50 + s * 30, 86, 50 + s * 4, 64); g.stroke();
      g.beginPath(); g.arc(50 + s * 24, 38, 6, 0, 7); g.arc(50 + s * 20, 66, 4, 0, 7); g.stroke();
    }
  },
  arbol: (g) => {
    g.beginPath(); g.moveTo(44, 92); g.lineTo(46, 60); g.lineTo(54, 60); g.lineTo(56, 92); g.stroke();
    g.beginPath(); g.arc(50, 40, 22, 0, 7); g.stroke(); g.beginPath(); g.arc(32, 50, 13, 0, 7); g.stroke(); g.beginPath(); g.arc(68, 50, 13, 0, 7); g.stroke();
    for (const [x, y] of [[44, 34], [58, 44], [34, 50], [66, 52], [52, 26]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(10, 92); g.lineTo(90, 92); g.stroke();
  },
  gato: (g) => {
    g.beginPath(); g.arc(50, 42, 22, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(32, 30); g.lineTo(30, 10); g.lineTo(44, 22); g.moveTo(68, 30); g.lineTo(70, 10); g.lineTo(56, 22); g.stroke();
    g.beginPath(); g.ellipse(41, 40, 4, 6, 0, 0, 7); g.ellipse(59, 40, 4, 6, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(47, 50); g.lineTo(53, 50); g.lineTo(50, 54); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(50, 54); g.quadraticCurveTo(45, 60, 41, 56); g.moveTo(50, 54); g.quadraticCurveTo(55, 60, 59, 56); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(50 + s * 10, 52); g.lineTo(50 + s * 30, 48); g.moveTo(50 + s * 10, 55); g.lineTo(50 + s * 30, 58); g.stroke(); }
    g.beginPath(); g.ellipse(50, 80, 18, 14, 0, Math.PI * 1.1, Math.PI * 1.9 + 0.01, true); g.stroke();
    g.beginPath(); g.moveTo(68, 82); g.quadraticCurveTo(90, 80, 84, 60); g.stroke();
  },
  coche: (g) => {
    g.beginPath(); g.moveTo(10, 66); g.lineTo(12, 50); g.lineTo(28, 46); g.lineTo(38, 30); g.lineTo(66, 30); g.lineTo(78, 46); g.lineTo(90, 50); g.lineTo(90, 66); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(41, 34); g.lineTo(34, 46); g.lineTo(52, 46); g.lineTo(52, 34); g.closePath(); g.moveTo(56, 34); g.lineTo(56, 46); g.lineTo(73, 46); g.lineTo(64, 34); g.closePath(); g.stroke();
    for (const x of [28, 72]) { g.beginPath(); g.arc(x, 67, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(x, 67, 4, 0, 7); g.stroke(); }
    g.strokeRect(84, 53, 5, 5);
  },
  cohete: (g) => {
    g.beginPath(); g.moveTo(50, 6); g.quadraticCurveTo(72, 28, 66, 70); g.lineTo(34, 70); g.quadraticCurveTo(28, 28, 50, 6); g.stroke();
    g.beginPath(); g.arc(50, 36, 9, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(35, 54); g.lineTo(20, 78); g.lineTo(34, 70); g.moveTo(65, 54); g.lineTo(80, 78); g.lineTo(66, 70); g.stroke();
    g.beginPath(); g.moveTo(42, 72); g.quadraticCurveTo(50, 98, 58, 72); g.stroke();
    motifStar(g, 15, 20, 5, -Math.PI / 2, false); motifStar(g, 85, 30, 4, -Math.PI / 2, false);
  },
  buho: (g) => {
    g.beginPath(); g.ellipse(50, 56, 28, 34, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(26, 36); g.lineTo(28, 16); g.lineTo(40, 28); g.moveTo(74, 36); g.lineTo(72, 16); g.lineTo(60, 28); g.stroke();
    for (const x of [38, 62]) { g.beginPath(); g.arc(x, 44, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(x, 44, 4, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(46, 54); g.lineTo(54, 54); g.lineTo(50, 62); g.closePath(); g.stroke();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - (i % 2); j++) { g.beginPath(); g.arc(40 + j * 10 + (i % 2) * 5, 70 + i * 7, 4, 0, Math.PI); g.stroke(); }
    g.beginPath(); g.moveTo(10, 92); g.lineTo(90, 92); g.stroke();
  },
  tortuga: (g) => {
    g.beginPath(); g.ellipse(48, 56, 30, 20, 0, Math.PI, 0); g.lineTo(18, 56); g.stroke();
    g.beginPath(); g.moveTo(18, 56); g.lineTo(78, 56); g.stroke();
    g.beginPath(); g.moveTo(36, 40); g.lineTo(48, 36); g.lineTo(60, 40); g.lineTo(58, 52); g.lineTo(38, 52); g.closePath(); g.stroke();
    g.beginPath(); g.arc(86, 50, 9, 0, 7); g.stroke(); g.beginPath(); g.arc(89, 47, 1.8, 0, 7); g.fill();
    for (const x of [28, 64]) { g.beginPath(); g.ellipse(x, 62, 6, 8, 0, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(18, 54); g.lineTo(8, 58); g.lineTo(18, 58); g.stroke();
  },
  helado: (g) => {
    g.beginPath(); g.moveTo(32, 46); g.lineTo(50, 94); g.lineTo(68, 46); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(36 + i * 8, 46); g.lineTo(50 + i * 4 - 6, 80); g.stroke(); }
    g.beginPath(); g.arc(50, 34, 17, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
    g.beginPath(); g.moveTo(30, 46); for (let x = 30; x <= 70; x += 8) g.quadraticCurveTo(x + 4, 54, x + 8, 46); g.stroke();
    g.beginPath(); g.arc(50, 15, 5, 0, 7); g.stroke(); g.beginPath(); g.moveTo(52, 10); g.quadraticCurveTo(56, 4, 60, 6); g.stroke();
  },
  seta: (g) => {
    g.beginPath(); g.moveTo(14, 52); g.quadraticCurveTo(18, 14, 50, 12); g.quadraticCurveTo(82, 14, 86, 52); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(38, 52); g.quadraticCurveTo(34, 80, 40, 90); g.lineTo(60, 90); g.quadraticCurveTo(66, 80, 62, 52); g.stroke();
    for (const [x, y, r] of [[34, 34, 6], [54, 24, 7], [70, 40, 5], [46, 42, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(8, 90); g.lineTo(92, 90); g.stroke();
  },
  estrella: (g) => {
    g.lineWidth = 2.6; motifStar(g, 50, 54, 44, -Math.PI / 2, false);
    g.beginPath(); g.arc(43, 52, 2.5, 0, 7); g.arc(57, 52, 2.5, 0, 7); g.fill();
    g.beginPath(); g.arc(50, 58, 7, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
};

function renderFigure(name, W, H, caption) {
  const totalH = H || W;
  const capH = caption ? 30 : 0;
  const { c, g } = makeCanvas(W, totalH);
  const size = Math.min(W - 8, totalH - capH - 8);
  g.save();
  g.translate((W - size) / 2, (totalH - capH - size) / 2);
  g.scale(size / 100, size / 100);
  g.lineWidth = 2.4 * (100 / size) * 1.4; // ~3.4 px reales
  FIGURES[name](g);
  g.restore();
  if (caption) {
    g.font = fontB(20);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(caption, W / 2, totalH - capH / 2);
  }
  return c;
}

// ---------------------------------------------------------------------
//  PLANTILLAS (el texto admite {hoy}, {hoy+7}, {dia}, {mes}, {año})
// ---------------------------------------------------------------------
const TEMPLATES = [
  { id: "tarro", name: "Tarro de cocina", text: "LENTEJAS\nHecho: {hoy}", frame: "redondeado", font: 34 },
  { id: "congelador", name: "Congelador", text: "POLLO AL CURRY\n2 raciones\nCongelado: {hoy}\nConsumir antes: {hoy+90}", frame: "doble", font: 22 },
  { id: "abierto", name: "Abierto / caduca", text: "Abierto: {hoy}\nCaduca: {hoy+7}", frame: "ticket", font: 26 },
  { id: "nombre", name: "Nombre (cole)", text: "Lucía García", frame: "estrellas", font: 40 },
  { id: "regalo", name: "Regalo", text: "Para: Ana\nDe: Andrés\n¡Feliz cumpleaños!", frame: "corazones", font: 26 },
  { id: "remite", name: "Remitente", text: "REMITE:\nNombre Apellido\nC/ Mayor 1, 2ºA\n28001 Madrid", frame: "linea", font: 20 },
  { id: "planta", name: "Planta", text: "ALBAHACA\nRegar: lunes y jueves\nSembrada: {hoy}", frame: "hojas", font: 24 },
  { id: "caja", name: "Caja de mudanza", text: "CAJA 1\nCOCINA\n⚠ FRÁGIL", frame: "grueso", font: 32 },
  { id: "precio", name: "Precio / oferta", text: "OFERTA\n2,50 €", frame: "feston", font: 44 },
  { id: "archivo", name: "Archivador (lomo)", text: "FACTURAS {año}", frame: "doble", font: 34, rot: 90 },
  { id: "medicina", name: "Medicación", text: "# Ibuprofeno 600\nMañana\nMediodía\nNoche", list: true, frame: "fina", font: 22 },
  { id: "tareas", name: "Tareas de hoy", text: "# {dia} {hoy}\nComprar pan\nLlamar a mamá\nRegar plantas", list: true, frame: null, font: 22 },
  { id: "compra", name: "Lista de la compra", text: "# Compra {hoy}\nLeche\nPan\nHuevos\nFruta", list: true, frame: null, font: 26 },
  { id: "nota", name: "Nota rápida", text: "No olvides:\n¡Sacar la basura!", frame: "nube", font: 28 },
  { id: "cable", name: "Cable", text: "TV SALÓN", frame: "linea", font: 30 },
  { id: "wifi", name: "Wi-Fi invitados", text: "Wi-Fi: MiCasa\nClave: 12345678", frame: "redondeado", font: 26 },
  { id: "navidad", name: "Navidad", text: "¡Feliz Navidad!\nDe: la familia", frame: "navidad", font: 30 },
  { id: "recortar", name: "Vale / cupón", text: "VALE POR\nun abrazo", frame: "recortar", font: 34 },
  { id: "pelicula", name: "Noche de cine", text: "NOCHE DE CINE\n{dia} {hoy}", frame: "pelicula", font: 26 },
  { id: "fiesta", name: "Fiesta", text: "¡FIESTA!\nSábado a las 18:00", frame: "banderines", font: 32 }
];

function applyTemplate(t) {
  clearAllLayers();
  textLayer.text = t.text;
  $("textInput").value = t.text;
  $("chkListMode").checked = Boolean(t.list);
  textLayer.rotation = t.rot || 0;
  $("textRotVal").textContent = `${textLayer.rotation}°`;
  const f = Math.max(14, Math.min(80, t.font || 30));
  textLayer.fontSize = f;
  $("fontSize").value = String(f);
  $("fontSizeVal").textContent = String(f);
  textLayer.align = "center";
  $("textAlign").value = "center";
  frameLayer.style = t.frame || null;
  frameLayer.scale = 100;
  textLayer.cx = getPrintArea().cx;
  textLayer.cy = getCanvasTargetHeight() / 2;
  state.selectedLayer = "text";
  saveSettings();
  updateFrameInfo();
  renderScene();
}

// Miniatura de una plantilla (aproximada, solo para la galería)
function renderTemplatePreview(t, W, H) {
  const h = H || Math.round(W * 0.56);
  const { c, g } = makeCanvas(W, h);
  if (t.frame) drawFrame(g, t.frame, { x0: 0, x1: W, w: W, cx: W / 2 }, h, false);
  const lines = expandTokens(t.text).split("\n").map((l) => l.replace(/^#\s*/, ""));
  let fs = Math.min(t.font || 30, 60);
  g.font = fontB(fs);
  const maxW = (W - 30) * (t.rot ? h / W : 1);
  while (fs > 10 && (Math.max(...lines.map((l) => g.measureText(l).width)) > maxW || lines.length * fs * 1.2 > (t.rot ? W : h) - 24)) g.font = fontB(--fs);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.save();
  g.translate(W / 2, h / 2);
  if (t.rot) g.rotate((t.rot * Math.PI) / 180);
  lines.forEach((l, i) => g.fillText((t.list && i ? "☐ " : "") + l, 0, (i - (lines.length - 1) / 2) * fs * 1.2));
  g.restore();
  return c;
}

// ---------------------------------------------------------------------
//  Colocar un gráfico generado en la etiqueta (a tamaño real, nítido)
// ---------------------------------------------------------------------
function placeGenerated(canvasEl, what) {
  if (!loadImageSource(canvasEl, { crisp: true, name: what || "Gráfico", gallery: true })) return;
  imgLayer.original = null;
  const area = getPrintArea();
  const H = getCanvasTargetHeight();
  const isLabel = $("paperMode").value === "label";
  imgLayer.baseScale = isLabel ? Math.min(area.w / canvasEl.width, H / canvasEl.height) : area.w / canvasEl.width;
  imgLayer.zoom = 1;
  $("imgScale").value = "100";
  $("imgScaleVal").textContent = "100%";
  imgLayer.cx = area.cx;
  renderScene();
  imgLayer.cy = getCanvasTargetHeight() / 2;
  renderScene();
  if (what && isLabel && canvasEl.height > H * 1.15) toast(`${what} queda pequeño en esta etiqueta: mejor en rollo continuo o etiqueta grande.`, "warn", 6000);
  log(`Galería: ${what || "gráfico"} colocado (${canvasEl.width}×${canvasEl.height}).`);
}

// ---------------------------------------------------------------------
//  MIS DISEÑOS (guardados en el navegador)
// ---------------------------------------------------------------------
const DESIGNS_KEY = "pm270.designs.v1";

function listDesigns() {
  try { return JSON.parse(localStorage.getItem(DESIGNS_KEY) || "[]"); } catch { return []; }
}

function storeDesigns(arr) {
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(arr));
}

function canvasToData(src, maxSide, crisp) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const { c, g } = makeCanvas(src.width * s, src.height * s);
  g.drawImage(src, 0, 0, c.width, c.height);
  return { data: crisp ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85), w: c.width };
}

function saveCurrentDesign(name) {
  const thumbSrc = $("previewCanvas");
  const d = {
    id: `d_${Date.now().toString(36)}`,
    name: name || "Mi diseño",
    ts: Date.now(),
    thumb: canvasToData(thumbSrc, 200, true).data,
    paper: $("paperProfile").value,
    text: textLayer.text,
    list: $("chkListMode").checked,
    font: textLayer.fontSize,
    align: textLayer.align,
    rot: textLayer.rotation,
    tcx: textLayer.cx,
    tcy: textLayer.cy,
    frame: frameLayer.style,
    frameScale: frameLayer.scale || 100,
    img: null,
    // Todas las capas, de abajo arriba (los diseños antiguos solo traen text/img).
    layers: allLayersForSize().map((l) => {
      if (l.kind === "text") return { kind: "text", text: l.text, font: l.fontSize, align: l.align, rot: l.rotation, cx: l.cx, cy: l.cy };
      const st = canvasToData(l.source, l.crisp ? 1400 : 700, l.crisp);
      return {
        kind: "image",
        data: st.data,
        scale: (l.baseScale * l.source.width) / st.w,
        zoom: l.zoom,
        rotation: l.rotation,
        cx: l.cx,
        cy: l.cy,
        crisp: Boolean(l.crisp),
        name: l.name || "",
        gallery: Boolean(l.gallery)
      };
    })
  };
  const all = listDesigns();
  all.unshift(d);
  try {
    storeDesigns(all);
    toast(`Diseño guardado: ${d.name}.`, "ok", 3000);
  } catch {
    toast("No cabe en el almacenamiento del navegador. Borra algún diseño antiguo (sobre todo los que tienen foto).", "error", 8000);
  }
}

function loadDesign(d) {
  if (d.paper && getProfile(d.paper) && d.paper !== $("paperProfile").value) {
    setProfileValue(d.paper);
    applyPaperProfile(d.paper, { adaptContent: false });
  }
  clearAllLayers();
  $("chkListMode").checked = Boolean(d.list);
  frameLayer.style = d.frame || null;
  frameLayer.scale = d.frameScale || 100;
  updateFrameInfo();
  // Diseños antiguos: un texto y, como mucho, una imagen (debajo).
  const specs = d.layers || [
    ...(d.img ? [{ kind: "image", ...d.img }] : []),
    { kind: "text", text: d.text || "", font: d.font, align: d.align, rot: d.rot, cx: d.tcx, cy: d.tcy }
  ];
  const loadImg = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  Promise.all(specs.map((sp) => (sp.kind === "image" ? loadImg(sp.data) : null))).then((imgs) => {
    const list = [];
    specs.forEach((sp, i) => {
      if (sp.kind === "text") {
        if (!(sp.text || "").trim()) return;
        const t = newTextLayer();
        Object.assign(t, { text: sp.text, fontSize: sp.font || 30, align: sp.align || "center", rotation: sp.rot || 0, cx: sp.cx ?? getPrintArea().cx, cy: sp.cy ?? 100 });
        list.push(t);
      } else if (imgs[i]) {
        const l = newImageLayer();
        Object.assign(l, { source: imgs[i], crisp: Boolean(sp.crisp), baseScale: sp.scale, zoom: sp.zoom || 1, rotation: sp.rotation || 0, cx: sp.cx, cy: sp.cy, name: sp.name || d.name || "Imagen", gallery: Boolean(sp.gallery) });
        list.push(l);
      }
    });
    layers = list;
    const lastImg = [...list].reverse().find((l) => l.kind === "image");
    const lastText = [...list].reverse().find((l) => l.kind === "text");
    if (lastImg) selectLayer(lastImg);
    if (lastText) selectLayer(lastText);
    else $("textInput").value = "";
    saveSettings();
    renderScene();
  });
}

function updateFrameInfo() {
  if (typeof updateLayerChips === "function") updateLayerChips();
}

// ---------------------------------------------------------------------
//  VENTANA «GALERÍA»: pestañas, opciones y miniaturas
// ---------------------------------------------------------------------
const gal = {
  tab: "plantillas",
  seed: newSeed(),
  monthOffset: 0,
  theme: "animales",
  custom: "",
  level: "medio",
  habits: "Agua\nLeer\nEjercicio\nDormir 8 h",
  codeType: "qr",
  codeText: "https://",
  codeCaption: "",
  wifiSsid: "",
  wifiPass: "",
  figCaption: ""
};

const GAL_TABS = [
  ["plantillas", "Plantillas"],
  ["marcos", "Marcos"],
  ["calendarios", "Calendarios"],
  ["juegos", "Pasatiempos"],
  ["colorear", "Colorear"],
  ["codigos", "QR y barras"],
  ["disenos", "Mis diseños"]
];

const FIG_NAMES = { casa: "Casa", sol: "Sol", flor: "Flor", pez: "Pez", mariposa: "Mariposa", arbol: "Árbol", gato: "Gato", coche: "Coche", cohete: "Cohete", buho: "Búho", tortuga: "Tortuga", helado: "Helado", seta: "Seta", estrella: "Estrella" };
const PATTERN_NAMES = { hex: "Panal", escamas: "Escamas", triangulos: "Triángulos", ondas: "Ondas", estrellas: "Estrellas" };

function galWords() {
  if (gal.theme === "propias") return parseCustomWords(gal.custom);
  return THEMES[gal.theme].words.map(([w, c]) => [w, c]);
}

function galMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + gal.monthOffset, 1);
}

function wifiPayload() {
  const esc = (s) => String(s).replace(/([\;,:"])/g, "\\$1");
  return `WIFI:T:${gal.wifiPass ? "WPA" : "nopass"};S:${esc(gal.wifiSsid)};P:${esc(gal.wifiPass)};;`;
}

// Cada pestaña devuelve una lista de { label, make: () => canvas, use: canvas => void }
function galItems() {
  const t = targetSize();
  const W = t.w;
  const H = t.h;
  const S = gal.seed;
  const place = (what) => (c) => placeGenerated(c, what);
  switch (gal.tab) {
    case "plantillas":
      return TEMPLATES.map((tp) => ({
        label: tp.name,
        make: () => renderTemplatePreview(tp, W, H),
        use: () => applyTemplate(tp)
      }));
    case "marcos": {
      const h = H || Math.round(W * 0.56);
      const items = FRAMES.map((f) => ({
        label: f.name,
        make: () => {
          const { c, g } = makeCanvas(W, h);
          drawFrame(g, f.id, { x0: 0, x1: W, w: W, cx: W / 2 }, h, t.round);
          return c;
        },
        use: () => {
          frameLayer.style = f.id;
          updateFrameInfo();
          renderScene();
          toast(`Marco «${f.name}» puesto. Se ajusta solo al tamaño del papel.`, "ok", 3000);
        }
      }));
      items.unshift({
        label: "Sin marco",
        make: () => makeCanvas(W, h).c,
        use: () => { frameLayer.style = null; updateFrameInfo(); renderScene(); }
      });
      return items;
    }
    case "calendarios": {
      const m = galMonth();
      const now = new Date();
      const nextMon = new Date(now); nextMon.setDate(now.getDate() + 7);
      const habits = gal.habits.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
      return [
        { label: `Mes: ${MESES_C[m.getMonth()].toLowerCase()} ${m.getFullYear()}`, make: () => renderMonth(m.getFullYear(), m.getMonth(), W, H, { markToday: true }), use: place("El calendario") },
        { label: "Mes con huecos para notas", make: () => renderMonth(m.getFullYear(), m.getMonth(), W, H, { markToday: false, notes: true }), use: place("El calendario") },
        { label: "Esta semana", make: () => renderWeek(now, W, H), use: place("La semana") },
        { label: "Semana que viene", make: () => renderWeek(nextMon, W, H), use: place("La semana") },
        { label: "Hábitos del mes", make: () => renderHabits(m.getFullYear(), m.getMonth(), W, null, habits), use: place("La hoja de hábitos") }
      ];
    }
    case "juegos": {
      const words = galWords();
      if (words.length < 3) return [{ label: "Escribe al menos 3 palabras", make: () => messageCanvas(W, "Escribe al menos 3 palabras\n(una por línea: PALABRA: pista)"), use: () => {} }];
      return [
        { label: "Crucigrama", make: () => renderCrossword(words, S, W, false), use: place("El crucigrama") },
        { label: "Crucigrama (soluciones)", make: () => renderCrossword(words, S, W, true), use: place("La solución") },
        { label: "Sopa de letras", make: () => renderWordSearch(words, S, W, gal.level), use: place("La sopa de letras") },
        { label: "Laberinto", make: () => renderMaze(S, W, H), use: place("El laberinto") },
        { label: "Laberinto largo (rollo)", make: () => renderMaze(S + 1, W, Math.round(W * 1.6)), use: place("El laberinto") }
      ];
    }
    case "colorear": {
      const items = [
        { label: "Mandala", make: () => renderMandala(S, W, H), use: place("El mandala") },
        { label: "Mandala (otro)", make: () => renderMandala(S + 7, W, H), use: place("El mandala") }
      ];
      for (const [k, n] of Object.entries(PATTERN_NAMES)) items.push({ label: `Fondo: ${n}`, make: () => renderPattern(k, W, H), use: place("El fondo") });
      for (const [k, n] of Object.entries(FIG_NAMES)) {
        if (!FIGURES[k]) continue;
        items.push({ label: n, make: () => renderFigure(k, W, H, gal.figCaption.trim()), use: place("La figura") });
      }
      return items;
    }
    case "codigos": {
      const ch = H ? Math.min(H, 200) : 160;
      if (gal.codeType === "wifi") {
        if (!gal.wifiSsid.trim()) return [{ label: "Escribe el nombre de la red", make: () => messageCanvas(W, "Escribe el nombre de la red Wi-Fi"), use: () => {} }];
        return [{ label: `QR Wi-Fi «${gal.wifiSsid}»`, make: () => renderQR(wifiPayload(), gal.codeCaption || `Wi-Fi: ${gal.wifiSsid}`, W, H), use: place("El QR") }];
      }
      const txt = gal.codeText.trim();
      if (!txt) return [{ label: "Escribe un texto", make: () => messageCanvas(W, "Escribe el texto o enlace"), use: () => {} }];
      if (gal.codeType === "qr") return [{ label: "QR", make: () => renderQR(txt, gal.codeCaption, W, H), use: place("El QR") }];
      return [{ label: gal.codeType === "ean13" ? "EAN-13" : "Code 128", make: () => renderBarcode(txt, gal.codeType, W, ch), use: place("El código") }];
    }
    case "disenos":
      return listDesigns().map((d) => ({
        label: d.name,
        thumb: d.thumb,
        design: d,
        use: () => { loadDesign(d); toast(`Diseño «${d.name}» cargado.`, "ok", 2500); }
      }));
    default:
      return [];
  }
}

function messageCanvas(W, msg) {
  const { c, g } = makeCanvas(W, Math.round(W * 0.5));
  g.font = fontN(22);
  g.fillStyle = "#666";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines = msg.split("\n");
  lines.forEach((l, i) => g.fillText(l, W / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 28));
  return c;
}

function galField(label, html) {
  return `<label class="gal-field">${label} ${html}</label>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderGalOptions() {
  const box = $("galOptions");
  let html = "";
  const reseed = `<button type="button" class="btn-soft" data-gal="reseed">Otra versión</button>`;
  switch (gal.tab) {
    case "plantillas":
      html = `<span class="list-help">Pulsa una plantilla: se rellena el texto y el marco, y luego lo cambias a tu gusto. Las fechas ({hoy}, {hoy+7}…) se ponen solas al imprimir.</span>`;
      break;
    case "marcos":
      html = `<span class="list-help">El marco se adapta al papel elegido (también a etiquetas redondas) y se combina con el texto y el dibujo.</span>`;
      break;
    case "calendarios": {
      const opts = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((o) => {
        const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + o, 1);
        return `<option value="${o}" ${o === gal.monthOffset ? "selected" : ""}>${MESES_C[m.getMonth()].toLowerCase()} ${m.getFullYear()}</option>`;
      }).join("");
      html = galField("Mes", `<select data-gal="monthOffset">${opts}</select>`) +
        galField("Hábitos", `<textarea data-gal="habits" rows="2" style="width: 160px; min-height: 0;">${escapeHtml(gal.habits)}</textarea>`) +
        `<span class="list-help">Un calendario de mes queda mejor en rollo continuo o etiqueta grande.</span>`;
      break;
    }
    case "juegos": {
      const themes = Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${k === gal.theme ? "selected" : ""}>${v.name}</option>`).join("") +
        `<option value="propias" ${gal.theme === "propias" ? "selected" : ""}>Mis palabras</option>`;
      html = galField("Tema", `<select data-gal="theme">${themes}</select>`) +
        galField("Sopa", `<select data-gal="level"><option value="facil">Fácil</option><option value="medio">Media</option><option value="dificil">Difícil</option></select>`) +
        reseed +
        (gal.theme === "propias" ? galField("Palabras", `<textarea data-gal="custom" rows="3" style="width: 220px; min-height: 0;" placeholder="SOL: Nos da luz&#10;MAR: Agua salada">${escapeHtml(gal.custom)}</textarea>`) : "");
      break;
    }
    case "colorear":
      html = galField("Nombre bajo la figura", `<input type="text" data-gal="figCaption" value="${escapeHtml(gal.figCaption)}" style="width: 130px;" placeholder="(opcional)" />`) + reseed +
        `<span class="list-help">Para colorear conviene papel que admita rotulador o lápiz sin emborronarse.</span>`;
      break;
    case "codigos":
      html = galField("Tipo", `<select data-gal="codeType">
          <option value="qr">QR (texto o enlace)</option>
          <option value="wifi">QR de Wi-Fi</option>
          <option value="code128">Barras Code 128</option>
          <option value="ean13">Barras EAN-13</option></select>`) +
        (gal.codeType === "wifi"
          ? galField("Red", `<input type="text" data-gal="wifiSsid" value="${escapeHtml(gal.wifiSsid)}" style="width: 120px;" />`) +
            galField("Clave", `<input type="text" data-gal="wifiPass" value="${escapeHtml(gal.wifiPass)}" style="width: 120px;" />`)
          : galField("Texto", `<input type="text" data-gal="codeText" value="${escapeHtml(gal.codeText)}" style="width: 200px;" />`)) +
        (gal.codeType === "qr" || gal.codeType === "wifi" ? galField("Pie", `<input type="text" data-gal="codeCaption" value="${escapeHtml(gal.codeCaption)}" style="width: 120px;" placeholder="(opcional)" />`) : "") +
        (gal.codeType === "ean13" ? `<span class="list-help">12 o 13 cifras (la última se calcula sola).</span>` : "");
      break;
    case "disenos":
      html = galField("Nombre", `<input type="text" id="galDesignName" style="width: 160px;" placeholder="Mi etiqueta" />`) +
        `<button type="button" class="btn-blue" data-gal="save">Guardar lo que hay ahora</button>` +
        `<span class="list-help">Se guardan en este navegador: texto, marco, dibujo y papel.</span>`;
      break;
  }
  box.innerHTML = html;
  const lvl = box.querySelector('[data-gal="level"]');
  if (lvl) lvl.value = gal.level;
  const ct = box.querySelector('[data-gal="codeType"]');
  if (ct) ct.value = gal.codeType;
}

let galTimer = 0;
function renderGalTiles() {
  const grid = $("galTiles");
  grid.innerHTML = "";
  let items;
  try {
    items = galItems();
  } catch (err) {
    grid.innerHTML = `<p class="list-help">No se pudo preparar: ${escapeHtml(err.message)}</p>`;
    return;
  }
  if (!items.length) {
    grid.innerHTML = `<p class="list-help">${gal.tab === "disenos" ? "Aún no has guardado ningún diseño." : "Nada que mostrar."}</p>`;
    return;
  }
  for (const it of items) {
    const tile = document.createElement("div");
    tile.className = "gal-tile";
    tile.tabIndex = 0;
    tile.title = it.label;
    let canvasEl = null;
    if (it.thumb) {
      const im = document.createElement("img");
      im.src = it.thumb;
      im.alt = it.label;
      tile.appendChild(im);
    } else {
      try {
        canvasEl = it.make();
        tile.appendChild(canvasEl);
      } catch (err) {
        const p = document.createElement("p");
        p.className = "gal-err";
        p.textContent = `⚠️ ${err.message}`;
        tile.appendChild(p);
        tile.classList.add("disabled");
      }
    }
    const cap = document.createElement("span");
    cap.textContent = it.label;
    tile.appendChild(cap);
    if (it.design) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "gal-del";
      del.title = "Borrar este diseño";
      del.textContent = "✕";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!confirmInline(del)) return;
        storeDesigns(listDesigns().filter((x) => x.id !== it.design.id));
        renderGalTiles();
      });
      tile.appendChild(del);
    }
    const choose = () => {
      if (tile.classList.contains("disabled")) return;
      try {
        it.use(canvasEl);
        $("galleryDialog").close();
      } catch (err) {
        toast(`No se pudo usar: ${err.message}`, "error", 6000);
      }
    };
    tile.addEventListener("click", choose);
    tile.addEventListener("keydown", (ev) => { if (ev.key === "Enter") choose(); });
    grid.appendChild(tile);
  }
}

// Borrado en dos pulsaciones (sin ventanas emergentes del navegador)
function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1";
  btn.textContent = "¿Borrar?";
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = "✕"; }, 2500);
  return false;
}

function showGalTab(tab) {
  gal.tab = tab;
  document.querySelectorAll("#galTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  renderGalOptions();
  renderGalTiles();
}

function setupGallery() {
  const dlg = $("galleryDialog");
  if (!dlg) return;
  $("galTabs").innerHTML = GAL_TABS.map(([k, n]) => `<button type="button" class="btn-soft" data-tab="${k}">${n}</button>`).join("");
  $("galTabs").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-tab]");
    if (b) showGalTab(b.dataset.tab);
  });
  const onField = (ev) => {
    const el = ev.target;
    const key = el.dataset && el.dataset.gal;
    if (!key || el.tagName === "BUTTON") return;
    gal[key] = key === "monthOffset" ? Number(el.value) : el.value;
    const structural = key === "theme" || key === "codeType";
    clearTimeout(galTimer);
    galTimer = setTimeout(() => {
      if (structural) renderGalOptions();
      renderGalTiles();
    }, ev.type === "input" ? 350 : 0);
  };
  $("galOptions").addEventListener("input", (ev) => { if (ev.target.tagName !== "SELECT") onField(ev); });
  $("galOptions").addEventListener("change", (ev) => { if (ev.target.tagName === "SELECT") onField(ev); });
  $("galOptions").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-gal]");
    if (!b) return;
    if (b.dataset.gal === "reseed") {
      gal.seed = newSeed();
      renderGalTiles();
    } else if (b.dataset.gal === "save") {
      if (!hasPrintableContent()) {
        toast("No hay nada que guardar todavía: escribe un texto, pon un marco o un dibujo.", "warn", 5000);
        return;
      }
      saveCurrentDesign($("galDesignName").value.trim());
      renderGalTiles();
    }
  });
  $("btnGallery").addEventListener("click", () => {
    dlg.showModal();
    showGalTab(gal.tab);
  });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  // 📅 Inserta la fecha de hoy (se actualiza sola cada día)
  $("btnInsertDate").addEventListener("click", () => {
    const ta = $("textInput");
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + "{hoy}" + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + 5;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  updateFrameInfo();
}

setupGallery();
