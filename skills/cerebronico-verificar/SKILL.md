---
name: cerebronico-verificar
description: Ritual de cierre obligatorio de CerebroNico antes de dar por hecho un cambio — validar, superficie, manifiesto, CRLF, semilla de versión y prueba desde extracción limpia.
user_invocable: true
---

# Cierre de verificación (no se entrega sin esto)

Regla de la casa: **una afirmación sin comprobación visible es una promesa, no un
resultado.** Después de cualquier cambio, en este orden:

1. **Tipos + suites completas**: `npm run validar`. El descubrimiento es dinámico:
   toda suite en disco se ejecuta aunque no esté en el catálogo, y una declarada que
   ya no existe en disco es un rojo. Si añades una suite, regístrala además en
   `scripts/validar.mjs` con su descripción.
2. **Superficie**: `npm run superficie:verificar`. `server.ts` tiene un contrato de
   rutas y un techo de líneas (trinquete). Si tocaste una ruta, regenera el contrato
   (`npm run superficie`) y explica por qué crece.
3. **Semilla de versión ÚNICA**: `src/constants.ts → VERSION_SEMVER` manda sobre
   `package.json`, `index.html` y el ratchet de `tests/bajoConsumo.test.ts`. Subir la
   versión sin subir el ratchet es un rojo deliberado.
4. **Manifiesto**: `npm run manifiesto` y luego `npm run manifiesto:verificar`
   (o `sha256sum -c MANIFIESTO_SHA256_vX.txt`). Cubre TODO el paquete menos
   `node_modules`, `.proyectos`, `*.log` y el propio manifiesto.
5. **BAT de Windows**: CRLF en cada línea, sin bloques `( ... )` con `echo` dentro,
   sin tildes, `pause` a secas (jamás `pause <nul`). Comprueba uniformidad:
   `LF == CRLF` en el archivo.
6. **Prueba desde extracción limpia**: descomprimir el ZIP en un directorio vacío,
   verificar el manifiesto contra lo extraído y ejecutar la capacidad nueva allí.
   Lo que solo funciona en el árbol de trabajo no funciona.
7. **Honestidad del informe**: cifras solo de corridas que acaban de ocurrir en esta
   sesión. Si el dato viene de antes, decir «según corrida anterior» o no darlo.

## Al integrar una capacidad externa (packs / MCP / skills)

- Debe ser **opcional por construcción**: si el servicio no está, la IDE arranca
  igual y el modelo simplemente no ve las herramientas (precedente v1.6.2 y v1.17.0).
- Nunca ofrecer dos packs que declaren las mismas herramientas.
- Todo lo que lea/escriba disco hereda las raíces del puente: dentro o nada.
- Si el binario no está en `puente-permitidos.json`, ampliar la lista es decisión del
  humano, no un paso de la implementación.
