#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueba de AUTOCURA DEL PUENTE :5000 (v2.3.24).

La queja de Mario (6/11): «el 5000 se cae, no muy seguido». Medido en el codigo:
`serve_forever()` corria al aire libre dentro de `main()`. Un OSError del lazo de
accept (WinError 10024 -demasiados sockets-, EMFILE, un `accept` interrumpido) NO
lo captura `socketserver`: sube hasta arriba, imprime traceback y MATA EL PROCESO.
El IDE lo leia como «:5000 OFF», y el puerto solo volvia si `server.ts` respawnaba
el puente - con el defecto del flag `puertoRobado` pegajoso (corregido en esta misma
version), muchas veces no volvia hasta pulsar «Reconectar».

Esta suite NO opina del fuente: INYECTA el fallo. Rompe el lazo de atencion una vez
y exige tres cosas, cada una con nombre propio:
  1. el proceso sigue vivo (eso es, exactamente, lo que el usuario llama «se cae»);
  2. el fallo se ANUNCIA con tipo y motivo (prohibida la caida silenciosa);
  3. el puente REABRE el mismo puerto y `/health` vuelve a contestar.

    python3 tests/puente_autocura_test.py

Sin node_modules y sin red. Puerto alto y propio: no pisa el :5000 de nadie.
"""
importlib = __import__("importlib.util")
import os
import sys
import threading
import time
import urllib.request

RAIZ = __file__.rsplit("/", 2)[0]
PUERTO = 59517
os.environ["CN_BRIDGE_PORT"] = str(PUERTO)
if not os.environ.get("CN_PROJECT_DIR"):
    os.environ["CN_PROJECT_DIR"] = os.path.join(os.path.expanduser("~"), "Cerebronico")

f = importlib.util.spec_from_file_location("cn_puente_autocura", os.path.join(RAIZ, "agent_bridge_5000.py"))
puente = importlib.util.module_from_spec(f)
f.loader.exec_module(puente)

correctas, fallos = 0, []


def ok(desc, cond, detalle=""):
    global correctas
    if cond:
        correctas += 1
        print("  \u2713 " + desc)
    else:
        fallos.append(desc)
        print("  \u2717 " + desc + (("  \u2192 " + detalle) if detalle else ""))


class Captura(object):
    """Atrapa lo que el puente imprime sin taparle la salida al que prueba."""

    def __init__(self, real):
        self._real, self.lineas = real, []

    def write(self, s):
        self.lineas.append(s)
        return len(s)

    def flush(self):
        pass

    def isatty(self):
        return False


CORTE = threading.Event()
llamadas = {"veces": 0}
ServidorReal = puente.PuenteServidor


class ServidorConFalloInyectado(ServidorReal):
    """La primera escucha muere a proposito; la segunda sirve de verdad."""

    def serve_forever(self, poll_interval=None):
        llamadas["veces"] += 1
        if llamadas["veces"] == 1:
            raise OSError(99, "fallo inyectado por la prueba: lazo de accept roto")
        return ServidorReal.serve_forever(self, poll_interval=0.5)


puente.PuenteServidor = ServidorConFalloInyectado

print("\n[Autocura del puente :5000] se rompe el lazo a proposito y se mira que responda\n")

salida_real = sys.stdout
captura = Captura(salida_real)
sys.stdout = captura
hilo = threading.Thread(target=puente.main, name="puente-5000", daemon=True)
hilo.start()

esperado_hasta = time.time() + 12
reabierto = False
while time.time() < esperado_hasta:
    texto = "".join(captura.lineas)
    if "de nuevo escuchando" in texto:
        reabierto = True
        break
    time.sleep(0.2)
sys.stdout = salida_real
texto = "".join(captura.lineas)

ok("el proceso SIGUE VIVO despues de romperse el lazo (no se cae)", hilo.is_alive(),
   "el hilo murio: el fallo sigue matando el servicio")
ok("la ruptura del lazo ocurre de verdad (la inyeccion funciono)", llamadas["veces"] >= 1,
   "veces=%d" % llamadas["veces"])
ok("el caida se ANUNCIA con tipo y motivo, no en silencio", "LAZO DE ATENCION CAIDO" in texto,
   texto[-240:].replace("\n", " | "))
ok("el anuncio trae el tipo del error (para poder diagnosticarlo)",
   "OSError" in texto and "fallo inyectado" in texto, texto[-160:].replace("\n", " | "))
ok("el puente REABRIO el puerto solo (sin respawnearlo desde el server)", reabierto)
ok("y lo reabrio en el MISMO puerto anunciado", ("127.0.0.1:%d" % PUERTO) in texto)

estado = None
for _ in range(20):
    try:
        estado = urllib.request.urlopen("http://127.0.0.1:%d/health" % PUERTO, timeout=2).status
        break
    except Exception:
        time.sleep(0.3)
ok("\u2605 /health responde 200 DESPUES de la caida (el usuario no tiene que tocar nada)",
   estado == 200, "estado=%s" % estado)

print("\n" + "=" * 56)
if not fallos:
    print("VEREDICTO: TODO CORRECTO \u2014 autocura del :5000, %d comprobaciones" % correctas)
    sys.exit(0)
print("VEREDICTO: %d FALLO(S) de %d en la autocura del :5000" % (len(fallos), correctas + len(fallos)))
for f in fallos:
    print("  \u00b7 " + f)
print("--- salida capturada del puente ---")
print(texto[-1200:])
sys.exit(1)

