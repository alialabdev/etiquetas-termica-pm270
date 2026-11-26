// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
package es.etiquetas.pm270;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Conexión con la PM270 por Bluetooth clásico (perfil de puerto serie, SPP),
 * igual que el puerto COM que crea Windows. La impresora se empareja antes en
 * los ajustes de Bluetooth del móvil.
 */
@SuppressLint("MissingPermission") // el permiso se comprueba en MainActivity.conPermisoBt
class Impresora {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final MainActivity act;
    private final SharedPreferences prefs;
    private final Object cerrojo = new Object();
    private BluetoothSocket socket;
    private OutputStream salida;

    Impresora(MainActivity act) {
        this.act = act;
        this.prefs = act.getSharedPreferences("impresora", Context.MODE_PRIVATE);
    }

    private BluetoothAdapter adaptador() {
        BluetoothManager bm = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    boolean hayRecordada() {
        return prefs.getString("direccion", null) != null;
    }

    private void error(String msg, boolean silencioso) {
        act.avisarWeb("onError", MainActivity.json(msg) + "," + silencioso);
    }

    /** El usuario pulsa «Conectar impresora»: lista de impresoras emparejadas. */
    void elegir() {
        act.conPermisoBt(this::mostrarLista,
                () -> error("Sin permiso de Bluetooth no se puede conectar la impresora. Actívalo en Ajustes › Aplicaciones › Etiquetas PM270 › Permisos.", false));
    }

    private void mostrarLista() {
        BluetoothAdapter ad = adaptador();
        if (ad == null) {
            error("Este móvil no tiene Bluetooth.", false);
            return;
        }
        if (!ad.isEnabled()) {
            error("Activa el Bluetooth del móvil y vuelve a pulsar «Conectar impresora».", false);
            return;
        }
        List<BluetoothDevice> lista = new ArrayList<>(ad.getBondedDevices());
        if (lista.isEmpty()) {
            new AlertDialog.Builder(act)
                    .setTitle("Empareja la impresora")
                    .setMessage("Enciende la PM270 y emparéjala en los ajustes de Bluetooth del móvil. Después vuelve aquí y pulsa «Conectar impresora».")
                    .setPositiveButton("Abrir ajustes de Bluetooth", (d, w) ->
                            act.startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)))
                    .setNegativeButton("Cancelar", null)
                    .setOnDismissListener(d -> error("Sin impresoras emparejadas.", true))
                    .show();
            return;
        }
        // Las que parecen la impresora van primero.
        lista.sort((a, b) -> Boolean.compare(!pareceImpresora(a), !pareceImpresora(b)));
        String[] nombres = new String[lista.size()];
        for (int i = 0; i < lista.size(); i++) {
            String n = lista.get(i).getName();
            nombres[i] = (n == null || n.isEmpty()) ? lista.get(i).getAddress() : n;
        }
        final boolean[] elegido = {false};
        new AlertDialog.Builder(act)
                .setTitle("Elige la impresora")
                .setItems(nombres, (d, i) -> {
                    elegido[0] = true;
                    conectar(lista.get(i), false);
                })
                .setNegativeButton("Cancelar", null)
                .setOnDismissListener(d -> {
                    if (!elegido[0]) error("Conexión cancelada.", true);
                })
                .show();
    }

    private static boolean pareceImpresora(BluetoothDevice d) {
        String n = d.getName();
        if (n == null) return false;
        n = n.toUpperCase(Locale.ROOT);
        return n.contains("PM") || n.contains("NELKO") || n.contains("PRINT");
    }

    /** Reconexión automática a la última impresora, sin preguntar nada. */
    void reconectar() {
        BluetoothAdapter ad = adaptador();
        String dir = prefs.getString("direccion", null);
        if (ad == null || dir == null || !ad.isEnabled() || !tienePermiso()) {
            error("Sin reconexión automática.", true);
            return;
        }
        try {
            conectar(ad.getRemoteDevice(dir), true);
        } catch (IllegalArgumentException e) {
            error("Sin reconexión automática.", true);
        }
    }

    private boolean tienePermiso() {
        return android.os.Build.VERSION.SDK_INT < 31
                || act.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private void conectar(BluetoothDevice dev, boolean silencioso) {
        new Thread(() -> {
            cerrar(false);
            BluetoothSocket s = null;
            try {
                s = dev.createRfcommSocketToServiceRecord(SPP);
                s.connect();
            } catch (IOException e) {
                try {
                    if (s != null) s.close();
                } catch (IOException ignored) {
                }
                // Algunos equipos solo responden en el canal 1.
                try {
                    s = (BluetoothSocket) dev.getClass().getMethod("createRfcommSocket", int.class).invoke(dev, 1);
                    s.connect();
                } catch (Exception e2) {
                    try {
                        if (s != null) s.close();
                    } catch (IOException ignored) {
                    }
                    error("No se pudo conectar con la impresora. Comprueba que está encendida y cerca, y que no la está usando otro aparato (por ejemplo el PC).", silencioso);
                    return;
                }
            }
            final BluetoothSocket abierto = s;
            try {
                synchronized (cerrojo) {
                    socket = abierto;
                    salida = abierto.getOutputStream();
                }
                prefs.edit().putString("direccion", dev.getAddress()).apply();
                String n = dev.getName();
                act.avisarWeb("onConnected", MainActivity.json(n == null ? "" : n));
                leer(abierto, abierto.getInputStream());
            } catch (IOException e) {
                error("No se pudo abrir la conexión: " + e.getMessage(), silencioso);
            }
        }, "pm270-conectar").start();
    }

    private void leer(BluetoothSocket s, InputStream in) {
        byte[] buf = new byte[1024];
        String motivo = "la impresora se ha desconectado";
        try {
            while (true) {
                int n = in.read(buf);
                if (n < 0) break;
                if (n > 0) {
                    byte[] trozo = new byte[n];
                    System.arraycopy(buf, 0, trozo, 0, n);
                    act.avisarWeb("onData", MainActivity.json(Base64.getEncoder().encodeToString(trozo)));
                }
            }
        } catch (IOException e) {
            if (e.getMessage() != null) motivo = e.getMessage();
        }
        boolean eraLaActual;
        synchronized (cerrojo) {
            eraLaActual = socket == s;
        }
        if (eraLaActual) {
            cerrar(false);
            act.avisarWeb("onLost", MainActivity.json(motivo));
        }
    }

    /** Envía bytes a la impresora; false si no hay conexión o falla. */
    boolean escribir(byte[] datos) {
        synchronized (cerrojo) {
            if (salida == null) return false;
            try {
                salida.write(datos);
                salida.flush();
                return true;
            } catch (IOException e) {
                return false;
            }
        }
    }

    void cerrar(boolean olvidar) {
        BluetoothSocket s;
        synchronized (cerrojo) {
            s = socket;
            socket = null;
            salida = null;
        }
        if (s != null) {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
        if (olvidar) prefs.edit().remove("direccion").apply();
    }
}
