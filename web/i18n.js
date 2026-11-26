// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
// Textos de la interfaz, preparados para traducir.
// - En JS: t("clave") o t("clave", { n: 3 }) para sustituir {n}.
// - En HTML: data-i18n="clave"; el texto escrito en el HTML es el español.
// Las traducciones (inglés y otros idiomas europeos) se añadirán en i18n.dicts
// en un paso posterior, con un menú de idioma (icono de globo).
(function () {
  const es = {
    "hint.mouse": "Arrastra el dibujo y el texto para moverlos. Rueda del ratón = tamaño del dibujo.",
    "hint.touch": "Arrastra con el dedo para mover. Pellizca con dos dedos para cambiar el tamaño.",
    "conn.ble": "Conectar por Bluetooth LE",
    "conn.bleHelp": "Otra forma de conectar, para móviles o navegadores sin puerto serie. Primero prueba «Conectar impresora».",
    "conn.connected": "Impresora conectada.",
    "conn.connectedBle": "Impresora conectada por Bluetooth LE.",
    "conn.bleFail": "No se pudo conectar por Bluetooth LE:",
    "conn.nativeWriteFail": "No se pudo enviar a la impresora por Bluetooth.",
    "conn.lostRetry": "Se ha perdido la conexión con la impresora. Intentando reconectar…",
    "about.coffee": "Invítame a un café",
    "about.coffeeHelp": "La app es gratuita y sin anuncios. Si te resulta útil, puedes apoyarla con un café.",
    "about.legal": "Proyecto independiente y de código abierto (licencia AGPL-3.0), no afiliado a Nelko. Nelko es marca de su titular. Se ofrece sin ninguna garantía.",
    "about.version": "Versión",
    "about.source": "Código fuente",
    "frame.size": "Tamaño del marco",
    "test.button": "Etiqueta de prueba",
    "test.title": "Etiqueta de prueba",
    "test.help": "Una sola etiqueta con 12 muestras: cada fila es un modo de foto (limpia, tramada, nítido) y cada columna cambia el brillo o el contraste respecto a lo que tienes puesto. La intensidad es la misma para toda la etiqueta y va escrita arriba: para compararla, imprime otra con otra intensidad.",
    "test.print": "Imprimir prueba",
    "common.cancel": "Cancelar",
    "conn.bleLost": "Se ha perdido la conexión Bluetooth. Pulsa «Conectar impresora».",
    "conn.bleNoChannel": "Ese dispositivo no tiene el canal de impresión de la PM270. Elige la impresora en la lista.",
    "conn.noApiIos": "En iPhone y iPad ningún navegador deja usar Bluetooth desde una web. Usa la app gratuita «Bluefy» (navegador con Web Bluetooth) para abrir esta página, o imprime desde el PC o un móvil Android con Chrome.",
    "conn.noApiAndroid": "Abre la página en Google Chrome actualizado para conectar la impresora (y empareja antes la PM270 en Ajustes > Bluetooth del móvil).",
    "conn.noApi": "Usa Google Chrome o Microsoft Edge desde http://localhost para conectar la impresora."
  };
  const dicts = { es };
  let lang = "es";
  function t(key, vars) {
    let s = (dicts[lang] && dicts[lang][key]) ?? es[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = dicts[lang] && dicts[lang][el.dataset.i18n];
      if (v) el.textContent = v;
    });
  }
  window.t = t;
  window.i18n = {
    dicts,
    get lang() { return lang; },
    setLang(l) {
      lang = dicts[l] ? l : "es";
      document.documentElement.lang = lang;
      apply();
    }
  };
})();
