# MANIFIESTO ÚNICO — cómo funciona desde v1.0.10

**Un paquete = una firma.** Desde v1.0.10 el manifiesto SHA256 es un solo archivo rolling:

- **`MANIFIESTO_SHA256.txt`** — firmado en cada empaquetado; su cabecera declara la versión
  (`# MANIFIESTO SHA256 — v<X.Y.Z> (fecha)`). Se genera con `npm run manifiesto`
  (`scripts/manifiesto.mjs`) y se verifica con `node scripts/manifiesto.mjs --verificar`
  o `sha256sum -c MANIFIESTO_SHA256.txt`.

## Qué NO es manifiesto (y dónde está)
- Los viejos **`MANIFIESTO_SHA256_v<versión>.txt`** (45 archivos, hasta v2.3.0): archivados en
  `documentacion/_archivo-consolidado/MANIFIESTOS-HISTORICOS/`. Son firmas de árboles que ya no
  existen: no verifican nada en el paquete actual y pesaban ~10 MB entre todos. **No viajan** en
  el ZIP (regla `MANIFIESTO_VIEJO_RE` en `scripts/empaquetar.mjs`).
- El manifiesto del **transporte** (partes .bin): `*-MANIFIESTO-PARTES.json`, generado por
  `unir-partes.mjs` al partir ZIPs grandes. No es la firma de la obra.
- El manifiesto de **ENTREGA** (`ENTREGA/MANIFIESTO-CHECKSUMS-*.txt`): lo escribe
  `scripts/entregar.ts` al entregar una obra al usuario; es por entrega, no por build.

## Por qué antes había 46
Cada build escribía `MANIFIESTO_SHA256_v<versión>.txt` y ningún paso retiraba el anterior:
46 firmas de 46 árboles distintos convivían en la raíz y viajaban en el ZIP (lo mostró la
captura de Mario del 09/11). El generador ahora escribe SIEMPRE el mismo nombre; el viejo
quedan excluidos de la firma y del viaje, y `--verificar` sigue sabiendo leer un histórico
si es lo único que hay en un paquete ya entregado.
