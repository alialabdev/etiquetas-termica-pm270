// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
// Service worker: permite abrir la app instalada aunque no esté el servidor de Python.
// Estrategia "red primero": si el servidor está encendido se usan siempre los
// archivos nuevos (y se guardan); si no, se usa la última copia guardada.
const CACHE = "pm270-v15";
const SHELL = [
  "./",
  "./index.html",
  "./version.js",
  "./i18n.js",
  "./app.js",
  "./creativo.js",
  "./mural.js",
  "./vendor/qrcode.js",
  "./manifest.webmanifest",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // "no-cache": pregunta siempre al servidor si hay versión nueva (así no se
  // queda pegada una copia vieja de la app en la caché del navegador).
  ev.respondWith(
    fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
          .then((hit) => hit || new Response("Sin conexión", { status: 503 }))
      )
  );
});
