# Seguridad · Security

## Cómo avisar de un problema

Si encuentras un problema de seguridad, **no abras una *issue* pública**. Usa el botón **Report a vulnerability** de la pestaña **Security** de este repositorio: el aviso llega en privado. Cuenta qué has visto y cómo reproducirlo. Intentaremos responder en unos días y publicar una versión corregida lo antes posible.

## How to report a problem

If you find a security problem, **please do not open a public issue**. Use the **Report a vulnerability** button in this repository's **Security** tab, which sends the report privately. Describe what you found and how to reproduce it. We will try to reply within a few days and publish a fixed version as soon as possible.

## Qué se revisa antes de cada versión · What is reviewed before each release

- La app no hace conexiones de red (CSP `connect-src 'self'`) ni incluye analíticas o rastreadores. · No network connections (CSP `connect-src 'self'`), no analytics or trackers.
- Los textos del usuario no se insertan como HTML sin escapar. · User text is never inserted as unescaped HTML.
- La app Android solo carga sus propios archivos; el resto de enlaces se abren en el navegador. Sin permiso de internet, sin copia de seguridad en la nube. · The Android app only loads its own bundled files; other links open in the browser. No internet permission, no cloud backup.
- Las acciones de GitHub están fijadas por hash y la clave de firma solo la ve el paso que firma. · GitHub Actions are pinned by commit hash and the signing key is only exposed to the signing step.
- El repositorio no contiene datos personales, claves ni contraseñas. · The repository contains no personal data, keys or passwords.

## Versiones con soporte · Supported versions

Solo la última versión publicada en Releases. · Only the latest version published in Releases.
