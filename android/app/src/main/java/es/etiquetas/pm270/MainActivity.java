// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
package es.etiquetas.pm270;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.util.Base64;

/**
 * Ventana de la app: carga la web de etiquetas desde los recursos de la APK
 * (https://appassets.androidplatform.net/assets/www/) y le da el puente
 * window.PM270Native para imprimir por Bluetooth.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String INICIO = "https://" + HOST + "/assets/www/index.html";
    private static final int PEDIR_BT = 1;
    private static final int ELEGIR_ARCHIVO = 2;

    private WebView web;
    private FrameLayout marco;
    private Impresora impresora;
    private ValueCallback<Uri[]> archivoPendiente;
    private Runnable trasPermiso;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        impresora = new Impresora(this);

        web = new WebView(this);
        marco = new FrameLayout(this);
        marco.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(marco);
        ajustarBordes();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::atras);
        }

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setMediaPlaybackRequiresUserGesture(true);

        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return cargador.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost()) && "https".equals(u.getScheme())) return false;
                // Enlaces de fuera (Amazon, café…): al navegador del móvil, solo http(s).
                String s = u.getScheme();
                if ("https".equals(s) || "http".equals(s)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {
                    }
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (archivoPendiente != null) archivoPendiente.onReceiveValue(null);
                archivoPendiente = cb;
                try {
                    startActivityForResult(p.createIntent(), ELEGIR_ARCHIVO);
                } catch (Exception e) {
                    archivoPendiente = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Puente(), "PM270Native");
        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl(INICIO);
    }

    /**
     * Desde Android 15 la app ocupa toda la pantalla: se deja sitio a la barra de
     * estado (reloj, avisos) y a la de navegación. El relleno se pone en el marco,
     * porque el WebView no lo respeta.
     */
    private void ajustarBordes() {
        marco.setOnApplyWindowInsetsListener((v, ins) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets b = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
            } else {
                v.setPadding(ins.getSystemWindowInsetLeft(), ins.getSystemWindowInsetTop(),
                        ins.getSystemWindowInsetRight(), ins.getSystemWindowInsetBottom());
            }
            return ins;
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onDestroy() {
        impresora.cerrar(false);
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido == ELEGIR_ARCHIVO && archivoPendiente != null) {
            archivoPendiente.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, datos));
            archivoPendiente = null;
        }
    }

    // --- Permiso de Bluetooth (Android 12 o posterior) ---
    void conPermisoBt(Runnable accion, Runnable sinPermiso) {
        if (Build.VERSION.SDK_INT < 31
                || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
            accion.run();
            return;
        }
        trasPermiso = accion;
        noPermiso = sinPermiso;
        requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, PEDIR_BT);
    }

    private Runnable noPermiso;

    @Override
    public void onRequestPermissionsResult(int pedido, String[] permisos, int[] res) {
        super.onRequestPermissionsResult(pedido, permisos, res);
        if (pedido != PEDIR_BT) return;
        Runnable si = trasPermiso, no = noPermiso;
        trasPermiso = null;
        noPermiso = null;
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
            if (si != null) si.run();
        } else if (no != null) {
            no.run();
        }
    }

    // --- Llamadas a la web ---
    /** Ejecuta window.__pm270n.<funcion>(args) en la web; args ya va como JSON. */
    void avisarWeb(String funcion, String argsJson) {
        runOnUiThread(() -> web.evaluateJavascript(
                "window.__pm270n && window.__pm270n." + funcion + "(" + argsJson + ")", null));
    }

    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /** Lo que la web puede pedir a la APK (window.PM270Native). */
    private class Puente {
        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void choose() {
            runOnUiThread(() -> impresora.elegir());
        }

        @JavascriptInterface
        public void reconnect() {
            runOnUiThread(() -> impresora.reconectar());
        }

        @JavascriptInterface
        public boolean hasRemembered() {
            return impresora.hayRecordada();
        }

        @JavascriptInterface
        public boolean write(String b64) {
            try {
                return impresora.escribir(Base64.getDecoder().decode(b64));
            } catch (IllegalArgumentException e) {
                return false;
            }
        }

        @JavascriptInterface
        public void disconnect() {
            impresora.cerrar(false);
        }

        @JavascriptInterface
        public void saveImage(String nombre, String b64) {
            byte[] datos;
            try {
                datos = Base64.getDecoder().decode(b64);
            } catch (IllegalArgumentException e) {
                return;
            }
            if (datos.length > 20_000_000) return;
            String limpio = nombre.replaceAll("[^A-Za-z0-9._-]", "_");
            if (limpio.length() > 80) limpio = limpio.substring(0, 80);
            final String archivo = limpio.endsWith(".png") ? limpio : limpio + ".png";
            runOnUiThread(() -> guardarImagen(archivo, datos));
        }
    }

    private void guardarImagen(String nombre, byte[] datos) {
        try {
            Uri destino;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, nombre);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Etiquetas PM270");
                destino = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            } else {
                java.io.File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                destino = Uri.fromFile(new java.io.File(dir, nombre));
            }
            if (destino == null) throw new Exception("sin destino");
            try (OutputStream os = getContentResolver().openOutputStream(destino)) {
                if (os == null) throw new Exception("sin destino");
                os.write(datos);
            }
            Toast.makeText(this, "Guardada en Imágenes › Etiquetas PM270", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo guardar la imagen", Toast.LENGTH_LONG).show();
        }
    }

    /** Botón o gesto «atrás»: primero cierra el menú o la ventana abierta en la app; si no hay, sale. */
    private void atras() {
        web.evaluateJavascript("!!(window.__pm270n && window.__pm270n.back())", r -> {
            if (!"true".equals(r)) moveTaskToBack(true);
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        atras();
    }
}
