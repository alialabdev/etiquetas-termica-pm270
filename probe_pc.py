# Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
import argparse
import asyncio
import time
import serial
import serial.tools.list_ports
from bleak import BleakScanner, BleakClient

NELKO_WRITE_UUID = "0000ff02-0000-1000-8000-00805f9b34fb"
NELKO_NOTIFY_UUID = "0000ff01-0000-1000-8000-00805f9b34fb"


async def scan_ble():
    print("Escaneando dispositivos BLE durante 6 segundos...")
    print("(Asegúrate de que la PM270 esté encendida y NO conectada al móvil)\n")
    devices = await BleakScanner.discover(timeout=6.0, return_adv=True)
    for addr, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or "(sin nombre)"
        uuids = adv.service_uuids or []
        marker = " <-- POSIBLE NELKO" if ("PM" in name.upper() or "NELKO" in name.upper() or "P2" in name.upper()) else ""
        print(f"  {addr} | RSSI: {adv.rssi:>4} | {name}{marker}")
        if uuids:
            print(f"      Servicios anunciados: {uuids}")


async def inspect_ble(address: str):
    print(f"Conectando por BLE a {address}...")
    async with BleakClient(address) as client:
        print(f"Conectado: {client.is_connected}\nServicios GATT encontrados:")
        found_ff01 = False
        found_ff02 = False

        for service in client.services:
            print(f"  [Servicio] {service.uuid} ({service.description})")
            for char in service.characteristics:
                props = ",".join(char.properties)
                print(f"     └─ [Char] {char.uuid} | props: [{props}]")
                if "ff01" in char.uuid.lower():
                    found_ff01 = char.uuid
                if "ff02" in char.uuid.lower():
                    found_ff02 = char.uuid

        if found_ff01 and found_ff02:
            print("\n¡Detectado canal Nelko estándar (ff01/ff02)! Probando comandos...")

            def on_notify(_, data: bytearray):
                print(f"  << RESPUESTA BLE (hex): {data.hex(' ')} | ascii: {repr(bytes(data))}")

            await client.start_notify(found_ff01, on_notify)
            for cmd in [b"CONFIG?\r\n", b"BATTERY?\r\n", b"\x1b!?", b"\x1b!o"]:
                print(f"  >> Enviando: {repr(cmd)}")
                await client.write_gatt_char(found_ff02, cmd, response=False)
                await asyncio.sleep(0.8)
            await client.stop_notify(found_ff01)
        else:
            print("\nNo aparecen ff01/ff02 con ese UUID exacto. Revisa la lista de arriba para ver qué servicio usa.")


def list_serial_ports():
    print("Puertos serie disponibles en el PC:")
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("  (Ninguno encontrado)")
    for p in ports:
        print(f"  {p.device} - {p.description} [{p.hwid}]")


def test_serial(port: str, baud: int = 115200):
    print(f"Abriendo puerto serie {port}...")
    with serial.Serial(port, baudrate=baud, timeout=1.5) as ser:
        for cmd in [b"CONFIG?\r\n", b"BATTERY?\r\n", b"\x1b!?", b"\x1b!o"]:
            ser.reset_input_buffer()
            print(f"  >> Enviando: {repr(cmd)}")
            ser.write(cmd)
            time.sleep(0.5)
            resp = ser.read(128)
            print(f"  << RESPUESTA (hex): {resp.hex(' ')} | ascii: {repr(resp)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sondeo Bluetooth/Serie para NELKO PM270")
    parser.add_argument("--scan-ble", action="store_true", help="Escanear dispositivos BLE cercanos")
    parser.add_argument("--ble", metavar="ADDR", help="Inspeccionar servicios GATT de una MAC/UUID BLE")
    parser.add_argument("--list-ports", action="store_true", help="Listar puertos COM/serie del PC")
    parser.add_argument("--serial", metavar="PORT", help="Probar comandos TSPL/Nelko por puerto serie (ej. COM5)")
    args = parser.parse_args()

    if args.scan_ble:
        asyncio.run(scan_ble())
    elif args.ble:
        asyncio.run(inspect_ble(args.ble))
    elif args.list_ports:
        list_serial_ports()
    elif args.serial:
        test_serial(args.serial)
    else:
        parser.print_help()