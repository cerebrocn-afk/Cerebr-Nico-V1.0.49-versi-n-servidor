# SEGURIDAD Y CREDENCIALES — CerebróNico v1.0.1

Regla madre: **el instalador es público; las claves son privadas.** Nada que lleve
una `sk-`, un token o una contraseña puede salir en un zip, un EXE o un repo.

## Lo que cambió el 20-sep-2026 (v1.0.1)

1. **El instalador ya no empaqueta `.env`.** La config de electron-builder
   (`ide/backend/package.json` → `build`) listaba `../backend/.env` como
   `extraResource` (y `".env"` en el listado): cualquier compilación en una
   máquina con claves reales las habría **incrustado dentro del EXE**.
   Eliminadas ambas entradas. El paquete solo lleva `.env.example` (plantilla
   sin valores).
2. **`cn.aduana`** (complemento de la tanda `cn.*`) hace de portero: antes de
   firmar una entrega escanea secretos (API keys, tokens, claves privadas,
   `.env`) y **BLOQUEA con motivo** si algo asoma. Úsalo antes de compartir
   cualquier proyecto.
3. **Verificación de artefactos**: `comprobar-integridad.mjs` +
   `MANIFIESTO_SHA256_v1.0.txt` — el zip se auto-demuestra, entrada por entrada.

## Para el desarrollador que monta CerebróNico (tú, u otro)

- Las claves viven **solo** en `ide/backend/.env` de TU máquina (copiar desde
  `.env.example`). Ese archivo está declarado fuera del empaquetado; no lo
  subas a repos compartidos ni lo incluyas en zips de descarga.
- Proveedores que leen de ahí: Z.ai (chat cloud), Gemini (imágenes, opcional).
  Sin `.env`, la IDE funciona igual en modo local (Ollama) — las nubes son
  opcionales, nunca obligatorias.

## Si alguna vez distribuiste un paquete con claves dentro

Trátalo como compromiso, no como descuido: **rota las claves** (panel de Z.ai /
Google AI Studio → regenerar), actualiza tu `.env` local con las nuevas, y
re-empaqueta. Las claves viejas dejan de servir; eso es lo único que borra el
pasado en internet.

## Checklist previo a CUALQUIER zip final o `npm run dist`

```bash
# 1. ¿hay .env reales en el árbol empaquetable? (solo debe existir el .example)
find . -name ".env" -not -path "*/node_modules/*"
# 2. ¿algún secreto con forma de secreto?
grep -rniE "(api[_-]?key|secret|token|password)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9+/_=-]{16,}" \
  --include="*.*" . | grep -v ".env.example" | grep -v node_modules
# 3. cn.aduana desde la propia IDE (bloquea y firma) — o el barrido anterior por consola
# 4. node comprobar-integridad.mjs  → 0 MALAS · 0 FALTANTES
```

Nada de esto es fe: son cuatro comandos. Un producto que no puede probar que no
lleva secretos dentro, tampoco puede prometer que no los lleva.


---

<!-- UNIFICADO-v1.74.1 CREDENCIALES-y-papeleo.md -->
## Fuente: CREDENCIALES-y-papeleo.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### PAPELEO Y CREDENCIALES — qué hay que reunir

> ⚠️ **No es asesoramiento jurídico.** Aquí está el **inventario de datos y
> documentos** que hay que reunir, con los campos listos para rellenar. Cuáles
> se exigen, en qué formato y con qué tasas lo fija el organismo competente y
> **hay que confirmarlo con él o con un agente de propiedad industrial**. Los
> trámites cambian; esta lista es una ayuda de organización, no una norma.

Este archivo vive dentro del proyecto a propósito: **va en el paquete y se
actualiza con él**, así que el papeleo no se queda en un cajón aparte.

---

#### 1. Datos del inventor (rellenar)

| Campo | Valor |
|---|---|
| Nombre y apellidos | Mario Nicolas Quintero Marin |
| Documento de identidad | *(pendiente: tipo y número)* |
| Nacionalidad | *(pendiente)* |
| Domicilio completo | *(pendiente)* |
| Correo de contacto | *(pendiente)* |
| Teléfono | *(pendiente)* |

#### 2. Datos del solicitante (si es distinto del inventor)

| Campo | Valor |
|---|---|
| Persona física o jurídica | *(pendiente)* |
| Denominación | *(pendiente)* |
| Identificación fiscal | *(pendiente)* |
| Domicilio | *(pendiente)* |
| Representante legal | *(pendiente)* |

#### 3. Poder de representación

- [ ] Decidir si se presenta por sí mismo o mediante agente/representante.
- [ ] Si hay representante: poder firmado y sus datos completos.
- [ ] *(pendiente: si el organismo exige el poder en forma legalizada)*

#### 4. Documento técnico

- [x] **Memoria descriptiva** y reivindicaciones → `memoria-patente.md` (borrador
      vivo, versionado con el repositorio).
- [ ] Dibujos o figuras, si se aportan. Se numeran y se citan en la memoria.
- [ ] Resumen (abstract) de extensión limitada — el organismo fija el máximo.
- [ ] Listado de secuencias, si aplicara al sector. *(No parece aplicar.)*

#### 5. Sobre la titularidad y la autoría

- [x] Autor y propietario declarado en el `README.md` y en la licencia.
- [ ] Revisar la titularidad de lo desarrollado durante jornada laboral o con
      medios de un tercero: puede condicionar quién puede solicitar.
- [ ] Revisar el aviso de copyright y los reconocimientos a terceros.

#### 6. Antes de publicar en GitHub (importante para la prioridad)

Publicar el código **es una divulgación**. En muchos sistemas eso afecta a la
novedad si ocurre antes de presentar la solicitud, y algunos países conceden un
plazo de gracia que **no se aplica igual en todos**. Por eso:

- [ ] Confirmar con un profesional **el orden** entre publicar y presentar.
- [ ] Si se publica antes, dejar constancia de la **fecha exacta** de publicación
      (el propio historial del repositorio sirve de prueba).
- [ ] Decidir qué se publica: el código puede abrirse sin revelar el documento
      de patente, y viceversa.

#### 7. Secretos que NUNCA deben subirse

`.gitignore` ya los excluye, pero conviene saberlo:

| Archivo | Qué contiene |
|---|---|
| `.cerebro-db/boveda.json` | La bóveda de claves |
| `.cerebro-db/espejos-salud.json` | Historial de uso de los espejos |
| `.env` | Variables de entorno con credenciales |
| `.proyectos/` | Tus proyectos y datos de trabajo |

> Antes del primer `git add .`, comprobar con `git status` que ninguna de esas
> rutas aparece en la lista de lo que se va a añadir.

#### 8. Estado del papeleo

| Trámite | Estado |
|---|---|
| Memoria técnica | Borrador escrito, versionado |
| Reivindicaciones | Borrador (5), pendientes de revisión profesional |
| Datos del inventor | Parcial (falta documento, domicilio y contacto) |
| Datos del solicitante | Sin decidir |
| Dibujos | Sin decidir |
| Búsqueda de anterioridad | Sin hacer |
| Presentación | Sin fecha |
