/**
 * entradaReal.ts — EL PUNTO DE ENTRADA NO SE INVENTA (v1.56.8 · evolución de bucles)
 * ==================================================================================
 * DE DÓNDE SALE: del log general de Mario. La IDE escribió
 *   `[CerebroNico] Faltaba el index.html: generado para cargar src/main.tsx.`
 * y dos líneas después
 *   `[CerebroNico] Vía rápida: ✘ no existe el punto de entrada «./src/main.tsx»`.
 *
 * Eso no es un error: es una **alucinación de la propia herramienta**. El código
 * era
 *
 *   const entrada = nombresProyecto.find(…) ?? "src/main.tsx";
 *   fs.writeFileSync("index.html", indexHtmlMinimo(entrada));
 *
 * El `?? "src/main.tsx"` es una suposición con forma de dato. Cuando en el disco no
 * había ningún `main.tsx`, el generador produjo un HTML que referencia un archivo
 * inexistente, LO ANUNCIÓ COMO SI EXISTIERA, y el siguiente paso del bucle falló
 * contra su propia promesa. Peor: el sandbox arrancaba, el navegador pedía
 * `/src/main.tsx`, recibía 404, y la pantalla salía en blanco — el síntoma que
 * Mario persiguió durante varias sesiones.
 *
 * LA REGLA que centraliza este módulo: **una referencia a un archivo solo se
 * escribe si ese archivo está verificado en disco**. Si no lo está, hay dos
 * salidas honestas y ninguna es inventar:
 *   · HTML autocontenido (script en línea) — la app se ve, y dice qué falta;
 *   · negarse, nombrando lo que se buscó.
 *
 * Puro: recibe nombres, devuelve nombres o `null`. Cero disco, cero red, cero
 * adivinación. Determinista por construcción.
 */

/** Extensiones de entrada válidas, de más al más rara. */
const CANDIDATOS = [
  /^src\/main\.tsx$/,
  /^src\/main\.jsx$/,
  /^src\/main\.(ts|js|mjs)$/,
  /^src\/index\.tsx$/,
  /^src\/index\.(ts|jsx|js|mjs)$/,
  // SIN la bandera `/i` en `app`: con ella, `src/App.tsx` (componente) casaba igual
  // que `src/app.tsx` (convención de framework tipo Next/Svelte). La diferencia es
  // justamente la que separa "esto monta la app" de "esto es un componente que
  // nadie monta". Verificado contra el caso real del log.
  /^src\/app\.(tsx|jsx|ts|js|mjs)$/,
  /^app\.(tsx|jsx|ts|js|mjs)$/,
  /^index\.(tsx|jsx|ts|js|mjs)$/i,
  // OJO: `src/App.tsx` NO figura, a propósito. Es un COMPONENTE, no un punto de
  // montaje: `<script src="./src/App.tsx">` no renderiza nada porque nadie llama a
  // `createRoot(...).render(...)`. Aceptarla convertía el generador en una máquina
  // de HTML "válido" que producía, otra vez, pantalla en blanco — justo el síntoma
  // que se quería curar. Sin `main`/`index` verificable la respuesta correcta es
  // `null`, y `null` obliga al llamante a decirlo en vez de fingir que hay app.
];

const normalizar = (r: string) => String(r || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");

/**
 * El punto de entrada REAL, o `null` si no hay ninguno verificado.
 *
 * Nunca devuelve un nombre que no esté en `nombres`. Ese `null` es el dato
 * importante: obliga al llamante a elegir una de las dos salidas honestas en vez
 * de arrastrar una suposición hasta el 404.
 */
export function puntoDeEntradaVerificable(nombres: string[]): string | null {
  const reales = new Set((nombres || []).map(normalizar));
  for (const patrón of CANDIDATOS) {
    for (const n of reales) if (patrón.test(n)) return n;
  }
  // Y NINGÚN respaldo "tomá la fuente más a la raíz". Eso era inventar con otros
  // ropajes: `src/App.tsx` o `src/utils/format.ts` existen en disco, sí, pero no
  // son entradas, y usarlas producía el mismo blanco que el `?? "src/main.tsx"`.
  // La honestidad aquí es costosa: hay que decir «no hay entrada» y dejar que el
  // usuario (o el agente) la cree.
  return null;
}

/**
 * `index.html` que NO miente.
 *
 * Con entrada verificada: carga ese archivo (como antes).
 * Sin entrada: HTML autocontenido, sin `<script src>` a un archivo inexistente,
 * que le dice al usuario qué falta. Antes, en ese caso, se emitía un `src` roto.
 */
export function indexHtmlHonesto(entrada: string | null, titulo = "App"): string {
  const head = [
    "<!DOCTYPE html>",
    '<html lang="es">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${String(titulo).replace(/[<>&]/g, "")}</title>`,
    "  </head>",
    '  <body>',
    '    <div id="root"></div>',
  ];
  if (entrada) {
    return [
      ...head,
      `    <script type="module" src="./${normalizar(entrada)}"></script>`,
      "  </body>",
      "</html>",
      "",
    ].join("\n");
  }
  // Sin entrada verificada NO se escribe ningún `src`: se explica en la propia
  // página. Un `<script src="./src/main.tsx">` inventado es exactamente el bug.
  return [
    ...head,
    "    <script>",
    "      document.getElementById('root').innerHTML =",
    "        '<pre style=\"font:14px/1.6 ui-monospace,monospace;padding:24px;white-space:pre-wrap\">' +",
    "        'App sin punto de entrada.\\n\\n' +",
    "        'No existe en disco ningún archivo que el index.html pueda cargar.\\n' +",
    "        'Crea src/main.tsx (o indicá el tuyo) y volvé a previsualizar.\\n' +",
    "        'El index.html NO se escribió apuntando a un archivo inexistente:\\n' +",
    "        'eso es lo que producía la pantalla en blanco.</pre>';",
    "    </script>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * La sonda de salud de la vía rápida: se pregunta por lo que el HTML REALMENTE
 * declara, no por una ruta fija.
 *
 * El código anterior empujaba siempre `/src/main.tsx` como sonda obligatoria. En un
 * proyecto con `src/index.tsx` la sonda fallaba y el diagnóstico acusaba de roto un
 * archivo que el proyecto nunca usó — un falso positivo que desviaba todo el bucle
 * de reparación hacia un archivo inexistente.
 */
export function sondaDeEntrada(
  entradaHtml: string | null,
  nombres: string[]
): { ruta: string; obligatoria: boolean } | null {
  if (entradaHtml) return { ruta: `/${normalizar(entradaHtml)}`, obligatoria: true };
  const real = puntoDeEntradaVerificable(nombres);
  if (!real) return null; // nada que sondear: se dice, no se inventa una sonda
  return { ruta: `/${real}`, obligatoria: true };
}

/*
 * NOTA DE HONESTIDAD (v1.56.8).
 *
 * Aquí iba a haber una función `veredictoLote(written, rejected)` para marcar el
 * lote de sincronización como fallo, con esta justificación leída del log: «el
 * Quirófano rechaza con REESCRITURA IDÉNTICA dentro de una respuesta 200 sin campo
 * `ok`, así que `isError = ok === false` nunca se activa y la escalera de firmas no
 * escala». Al ir a escribir el cable leí la línea real:
 *
 *     server.ts:9141   ok: rejected.length === 0 && missingImports.length === 0,
 *
 * El campo SÍ existe y SÍ vale false. La premisa era falsa, así que la función se
 * borra en lugar de entregarse: un arreglo cuya causa no existe es ruido con forma
 * de mejora, y encima taparía la causa verdadera (los rechazos repetidos vienen del
 * sync del EDITOR, que no pasa por el bucle de herramientas del agente).
 */
