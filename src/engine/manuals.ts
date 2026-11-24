/**
 * manuals.ts — LOS MANUALES DEL MOTOR (v2.0)
 * =========================================
 * Aquí está lo que pediste: inyectar en CerebroNico el conocimiento de CÓMO se
 * usan las herramientas, para que viaje en el MOTOR y no dependa de que el
 * modelo lo sepa. Cualquier conductor —un qwen de 0,5 B, GLM, Gemini— recibe el
 * mismo manual y trabaja igual de bien.
 *
 * Tres capas, por orden de importancia:
 *
 *   1. LEYES DEL MOTOR. Reglas que impiden el fallo más caro de un modelo débil:
 *      afirmar que hizo algo cuando no lo hizo, inventar nombres de herramientas
 *      y rutas, dar por bueno algo sin verificarlo.
 *   2. MANUAL POR HERRAMIENTA. Cuándo usar cada una, cómo, y el error típico que
 *      hay que evitar. Se envía solo el manual de las herramientas ACTIVAS.
 *   3. PROCEDIMIENTOS. Recetas paso a paso para los trabajos frecuentes (crear
 *      una página, arreglar un error de compilación, arreglar un test, publicar
 *      en el sandbox).
 *
 * Formato: entradas de la base de conocimiento (KbEntry), así que además de
 * inyectarse quedan consultables con /api/engine/kb?q=...
 */

import type { KbEntry } from "./knowledgeBase";

const M = (id: string, title: string, body: string, keys: string[], tags: string[], weight = 0.8): KbEntry => ({
  id,
  table: "manual",
  title,
  body,
  keys,
  tags,
  weight,
  lang: "es",
});

// ============================================================
// 1. LEYES DEL MOTOR — se inyectan SIEMPRE que haya herramientas
// ============================================================
export const ENGINE_LAWS: KbEntry[] = [
  M(
    "law-no-mentir",
    "Ley: no afirmes lo que no hiciste",
    "NUNCA digas que leíste un archivo, ejecutaste un comando o creaste un archivo si no llamaste a la herramienta y recibiste su resultado. Si una herramienta falla, di el error tal cual. Si no tienes herramientas disponibles, di «no puedo ejecutar acciones con este modelo» en lugar de simular un resultado. Inventar una ejecución es el peor error posible aquí: hace perder tiempo y rompe la confianza.",
    ["no mentir", "afirmar", "simular", "inventar", "resultado falso", "herramienta", "ejecuté"],
    ["ley", "honestidad"],
    1.0
  ),
  M(
    "law-no-inventar-nombres",
    "Ley: no inventes nombres ni rutas",
    "No inventes funciones, variables, rutas ni nombres de herramientas. Antes de escribir código que use algo del proyecto, pregúntale al motor con find_symbol (o search_in_files). Antes de usar una herramienta, usa el nombre EXACTO del manual; si un nombre no está en el manual, esa herramienta NO existe: no la llames.",
    ["inventar", "nombre", "ruta", "función", "tool", "no existe"],
    ["ley", "precisión"],
    1.0
  ),
  M(
    "law-verificar",
    "Ley: verifica antes de decir que terminaste",
    "Después de escribir o modificar código, comprueba lo que puedas: run_tests, run_command con el build, o al menos read_file_range para releer lo que quedó. Solo entonces informa. Si no pudiste verificar, dilo explícitamente: «cambios aplicados, no verificados».",
    ["verificar", "probar", "terminado", "listo", "comprobar", "test"],
    ["ley", "calidad"],
    0.95
  ),
  M(
    "law-una-pregunta",
    "Ley: una pregunta corta en vez de suponer",
    "Si falta un dato imprescindible (qué archivo, qué puerto, qué ruta, qué depende de qué), haz UNA pregunta corta y detente. No elijas por el usuario en decisiones destructivas o irreversibles.",
    ["preguntar", "duda", "ambiguo", "falta", "suponer"],
    ["ley", "interacción"],
    0.9
  ),
  M(
    "law-destructivo",
    "Ley: lo destructivo primero se avisa",
    "delete_file y run_command con rm/del, git reset, sobrescribir archivos grandes: para y pide confirmación. Explica qué se va a borrar y por qué.",
    ["borrar", "eliminar", "destructivo", "rm", "delete", "sobrescribir"],
    ["ley", "seguridad"],
    0.9
  ),
];

// ============================================================
// 2. MANUAL POR HERRAMIENTA
// ============================================================
export const TOOL_MANUALS: Record<string, KbEntry> = {
  // v1.0.28 — ONCE HERRAMIENTAS, NO TRESCIENTAS A UNA: si hay que cubrir 4 temas,
  // va UNA llamada con 4 preguntas. Cada llamada es un viaje completo y las
  // repetidas devuelven lo mismo: pagarlas tres veces es el error típico.
  abrir_red: M(
    "man-abrir_red",
    "abrir_red — varias preguntas, UNA petición",
    "Úsala SIEMPRE que necesites mirar la red más de una cosa en el mismo turno: pasás todas las preguntas juntas y el motor las pliega, las ordena y arma una sola consulta. Exige confirmar:true. El resultado incluye la consulta enviada y las preguntas que quedaron afuera: si algo no entró, se dice — no se pierde. Error típico: llamarla cuatro veces con una pregunta cada una, que es exactamente lo que evita.",
    ["abrir_red", "buscar", "red", "varias", "una petición", "consulta"],
    ["manual", "web"]
  ),
  set_plan: M(
    "man-set_plan",
    "set_plan — el CONTRATO del turno (hoja de ruta en el Planificador)",
    "Úsala UNA vez al principio si la tarea lleva más de 2 pasos. Recibe tasks: [{id, description, criterios_aceptacion?}] con ids cortos (t1, t2…). Desde v1.69.0 ESTO ES UN CONTRATO, no un adorno: el plan se escribe en la pestaña Planificador (ahora en primer plano, local Y nube) y el motor NO cierra el turno mientras queden etapas sin tachar — se auto-pregunta y te exige seguir en el mismo hilo hasta la entrega. Declará etapas chicas y verificables; en criterios_aceptacion poné la prueba de cada una (\"compila\", \"el preview muestra X\"). Error típico: replanificar en cada turno; reemplazá el plan solo si el pedido cambia de verdad.",
    ["set_plan", "plan", "contrato", "tareas", "pasos", "etapas", "planificador"],
    ["manual", "core"]
  ),
  update_task: M(
    "man-update_task",
    "update_task — TACHAR la etapa hecha (con evidencia)",
    "Actualiza una tarea del plan: {task_id, status, evidencia?}. Úsala al TERMINAR cada etapa: status \"in_progress\" al empezarla, \"completed\" al tacharla, \"failed\" con causa si es imposible (eso también cierra la etapa). Desde v1.69.0 el cierre es CONTRATO: completed sin \"evidencia\" deja la puerta roja (cerrada_sin_verificar) y el motor te auto-pregunta hasta que adjuntes la prueba (\"tsc exit 0\", \"leído en disco: línea 42 dice X\"). Si el turno se cierra con etapas abiertas, la entrega se marca PARCIAL, no «Hecho».",
    ["update_task", "estado", "completada", "progreso", "tachar", "evidencia", "etapa"],
    ["manual", "core"]
  ),
  list_files: M(
    "man-list_files",
    "list_files — ver qué hay",
    "Lista el contenido del sandbox. OJO con la ruta: el sandbox es la RAÍZ DE DATOS resuelta al arrancar (por defecto `.proyectos`, pero con la raíz migrada es p. ej. `C:\\Cerebronico`). Nunca asumas ni inventes rutas absolutas: trabaja con rutas relativas a esa raíz y, si dudas, llama primero aquí para ver qué hay. Úsala ANTES de crear archivos, para no duplicar ni pisar lo que ya existe y para respetar la estructura del proyecto.",
    ["list_files", "listar", "archivos", "estructura"],
    ["manual", "core"]
  ),
  read_file: M(
    "man-read_file",
    "read_file — leer completo",
    "Lee un archivo del sandbox. Para archivos de más de ~300 líneas usa read_file_range (start/end) o search_in_files: leer 1.000 líneas llena el contexto y con un modelo pequeño eso es espera y ruido. El motor además compacta el resultado.",
    ["read_file", "leer", "archivo"],
    ["manual", "core"]
  ),
  read_file_range: M(
    "man-read_file_range",
    "read_file_range — leer por partes",
    "Lee {path, start, end} (líneas). Es la forma correcta de trabajar con archivos grandes: primero mira la estructura con find_symbol o read_file_range de las primeras 60 líneas, y luego solo el tramo que te interesa.",
    ["read_file_range", "rango", "líneas", "partes"],
    ["manual", "core"]
  ),
  write_file: M(
    "man-write_file",
    "write_file — crear o reemplazar completo (verificado en disco)",
    "Escribe {path, content} completo en el SANDBOX (raíz de datos). El contenido pasa por el BLINDAJE DE SINTAXIS y por el QUIRÓFANO. Desde v1.0.10 la respuesta dice la verdad: ok:true solo si los bytes están en disco (verificado_en_disco), y trae el veredicto de la tanda (ultimo_cierre con los archivos REVERTIDOS por nombre si el guardián cayó). La ruta es RELATIVA a la raíz del sandbox: nunca absolutas ni «../» (403 por diseño). Si la tanda revierte solo TU archivo, reescribí solo ese con el motivo en mano — los «conservados» ya están en disco. REGLA DE RAÍZ ÚNICA (v1.0.14): la raíz del sandbox es la RAÍZ DE DATOS resuelta al arrancar (p. ej. C:\\Cerebronico), NO la carpeta del programa (CerebroNico-IDE-v1.0.13). Nunca escribas tu obra en la instalación: el preview :3500 y el editor NO la ven. Antes de escribir confirmá con list_files / GET :3500/__cn_info QUÉ raíz se sirve y escribí ahí; no adivines rutas absolutas. NO hagas arqueología sobre el código de la IDE (pc_exec+findstr sobre server.ts/src/ para descubrir rutas): esas respuestas ya están en el contexto y acá; el tiempo del turno va a ESCRIBIR la obra, no a inspeccionar la casa.",
    ["write_file", "escribir", "crear", "reemplazar", "truncado", "disco", "revertido"],
    ["manual", "core"]
  ),
  // v1.0.10 · F10 — los cinco manuales que faltaban y costaron turnos enteros
  // (log [LOG:98]/[LOG:101]: «herramientas sin manual» justo en el paso
  // workspace→sandbox y en el preview, que es donde el modelo se perdía).
  ingresar_archivo_workspace: M(
    "man-ingresar_archivo_workspace",
    "ingresar_archivo_workspace — registrar material del usuario (NO lo hace editable)",
    "Recibe un archivo que el usuario subió y lo REGISTRA en el árbol de ENTRADA: queda disponible pero FUERA del sandbox — no lo leés ni escribís como obra hasta promoverlo. Usala para dejar constancia del material. Si de verdad vas a trabajar sobre él, pasá origen='sandbox_target' y entra derecho al sandbox (te ahorras el segundo paso). Ruta de destino: relativa a la raíz de datos; si dudas de dónde estás, list_files primero.",
    ["ingresar", "workspace", "subido", "entrada", "material"],
    ["manual", "rutas"]
  ),
  promover_archivo_sandbox: M(
    "man-promover_archivo_sandbox",
    "promover_archivo_sandbox — el paso OBLIGATORIO antes de editar material ajeno",
    "Mueve un archivo del árbol de entrada al SANDBOX (runtime). El guardián RECHAZA escrituras sobre material de entrada no promovido — por eso un write_file sobre un archivo subido puede decirte «no promovido»: no es un bug, es esta herramienta la que falta. Archivos nuevos que vos creás NO la necesitan (nacen en el sandbox). Si la promoción responde error de puente (:5000 caído), seguí en el sandbox: la promoción es entre árboles de la IDE, no toca el disco de la PC.",
    ["promover", "sandbox", "entrada", "material", "edit"],
    ["manual", "rutas"]
  ),
  abrir_previsualizador: M(
    "man-abrir_previsualizador",
    "abrir_previsualizador — levantar el sandbox :3500 y mostrar la obra",
    "Orden a la interfaz: abre el editor web, ARRANCA el sandbox si hace falta (:3500 nace solo al pedir preview; apagado es su estado normal) y refresca el previsualizador. Úsala después de escribir el index.html/entrada, ANTES de afirmar «se ve X». Si responde abierto:false no hay interfaz escuchando el turno: decilo, no insistas. Qué está sirviendo realmente: GET http://127.0.0.1:3500/__cn_info (raíz efectiva, index servido, duplicados, estado del bundle). Si «no se ve» lo que escribiste, consultá __cn_info antes de reescribir nada: el 90% de las veces el proyecto está en otra carpeta que la servida.",
    ["abrir", "previsualizador", "preview", "sandbox", "3500", "no se ve"],
    ["manual", "rutas"]
  ),
  revisar_cambios: M(
    "man-revisar_cambios",
    "revisar_cambios — cerrar la tanda YA y ver el veredicto completo",
    "Fuerza el cierre del QUIRÓFANO sin esperar el silencio de 3,5 s: corre las puertas (sintaxis, superficie, imports, peso, seguridad) y devuelve informe + puertas. Desde v1.0.10 la reversión es POR ARCHIVO: el informe nombra qué se revirtió (con la puerta y línea culpables) y qué se conservó. Úsala antes de informar «terminado» si tocaste código: es la diferencia entre «escribí» y «verifiqué».",
    ["revisar", "tanda", "quirófano", "verificar", "veredicto"],
    ["manual", "core"]
  ),
  deshacer_cambios: M(
    "man-deshacer_cambios",
    "deshacer_cambios — devolver la última operación a su estado anterior",
    "Deshace la tanda abierta o la última cerrada (usa el original guardado por el guardián). Acepta que la operación ya esté revertida (dice la verdad, no duplica el undo). Para archivos QUE NO EXISTÍAN, el undo los retira. No la uses como método de edición: si un cambio está mal, arreglalo con edit_file sobre el archivo actual; deshacer es para cuando la dirección entera estaba mal.",
    ["deshacer", "undo", "revertir", "tanda"],
    ["manual", "core"]
  ),
  append_file: M(
    "man-append_file",
    "append_file — añadir al final",
    "Añade texto al final de un archivo (lo crea si no existe). Es la forma recomendada de escribir archivos MUY largos: hazlo en varios tramos del mismo modo en que escribirías a mano. Evita el error de quedarte sin espacio y truncar.",
    ["append_file", "añadir", "final", "partes", "grande"],
    ["manual", "core"]
  ),
  edit_file: M(
    "man-edit_file",
    "edit_file — cambiar un trozo",
    "Reemplaza la primera aparición exacta de {path, find, replace}. Es la herramienta PREFERIDA para cambios puntuales: gasta pocos tokens y no reescribe el archivo entero (menos riesgo de romperlo). El texto de «find» debe copiarse EXACTAMENTE, con su indentación. Si el resultado rompe la sintaxis, el cambio se revierte.",
    ["edit_file", "editar", "reemplazar", "modificar", "cambio"],
    ["manual", "core"],
    0.95
  ),
  forjar_complemento: M(
    "man-forjar_complemento",
    "forjar_complemento — crear complementos nuevos",
    "Cuando pidan «un plugin/complemento para X»: compone una RECETA (id cn.algo en minúsculas, nombre, descripcion legible para el catálogo, permisos mínimos y 1-3 herramientas con params) y llama esta herramienta con la receta como JSON. El IDE compila manifest+panel, los valida con su propio juez y los instala: el complemento nace con pestaña, slash y herramientas para el planificador. Si la receta se tacha, te llegan TODOS los motivos: corrige y reenvía; nada se escribió.",
    ["forjar", "complemento", "plugin", "extensión", "crear plugin", "nueva extensión"],
    ["manual", "core"],
    0.9
  ),
  consultar_espejo: M(
    "man-consultar_espejo",
    "consultar_espejo — cálculo determinista en lote",
    "Los espejos calculan de verdad en ~1 ms: aritmética y unidades exactas (matematicos/fisicos), inventario estructural con nombres (codigos), idioma y perfil de texto (lenguajes), armonías HSL y grillas (artes/disenios), variantes reproducibles (creadores), diseño experimental (cientificos), registro cuántico (cuantico), lotes paralelos de plan (planificadores). MANDA LOTES de hasta 8 llamadas por golpe en vez de una por una. Trata sus salidas como HECHOS: si un espejo dice 34.7, eso es 34.7 — no lo recalcules de cabeza ni lo inventes.",
    ["espejo", "consultar_espejo", "calcular", "lote", "determinista", "aritmética", "accion", "poderes"],
    // PODERES v1: recuerda que cada espejo acepta {accion} — 22 operaciones nuevas.
    ["manual", "core"],
    0.9
  ),
  search_in_files: M(
    "man-search_in_files",
    "search_in_files — buscar dentro del código",
    "Busca un patrón de texto en todos los archivos del sandbox y devuelve archivo:línea. Úsala para localizar dónde se usa algo o dónde está definido cuando find_symbol no lo encuentra (por ejemplo, textos, claves CSS o cadenas).",
    ["search_in_files", "buscar", "grep", "dónde", "dentro"],
    ["manual", "core"]
  ),
  find_symbol: M(
    "man-find_symbol",
    "find_symbol — pregúntale al motor, no al modelo",
    "Devuelve funciones, clases, interfaces y componentes REALES del proyecto con archivo, línea y firma. Es la primera herramienta que debes usar antes de escribir código que llame a algo existente. Cuesta ~400 caracteres; leer el archivo entero cuesta miles.",
    ["find_symbol", "símbolo", "firma", "existe", "API"],
    ["manual", "core"],
    0.95
  ),
  make_dir: M(
    "man-make_dir",
    "make_dir — crear carpeta",
    "Crea una carpeta (con sus padres) dentro del sandbox. No hace falta llamarla antes de write_file: esa ya crea las carpetas necesarias.",
    ["make_dir", "carpeta", "directorio", "mkdir"],
    ["manual", "core"]
  ),
  delete_file: M(
    "man-delete_file",
    "delete_file — borrar (destructivo)",
    "Borra un archivo del sandbox. Es destructivo: avisa al usuario antes y explica por qué. No borres para «empezar de cero» sin decirlo.",
    ["delete_file", "borrar", "eliminar", "destructivo"],
    ["manual", "core"]
  ),
  run_command: M(
    "man-run_command",
    "run_command — ejecutar en el sandbox",
    "Ejecuta {command} dentro de .proyectos (npm, node, python, git, ls). Úsala para instalar, compilar o inspeccionar. Reglas: un comando por llamada; nada de comandos interactivos que esperen entrada; si el comando falla, el motor te devuelve las líneas de error completas (no se compactan) — léelas antes de reintentar, no repitas el mismo comando.",
    ["run_command", "comando", "terminal", "npm", "ejecutar", "build"],
    ["manual", "core"],
    0.95
  ),
  run_tests: M(
    "man-run_tests",
    "run_tests — comprobar que no rompiste nada",
    "Ejecuta las pruebas del proyecto (npm test por defecto) y devuelve el resumen. Úsala DESPUÉS de tocar código y antes de decir que terminaste. Si no hay pruebas configuradas, dilo y propone una comprobación alternativa (build o un script de humo).",
    ["run_tests", "test", "pruebas", "verificar"],
    ["manual", "core"]
  ),
  git_status: M(
    "man-git_status",
    "git_status / git_diff / git_commit — red de seguridad",
    "git_status muestra qué cambió; git_diff el detalle; git_commit guarda con un mensaje. Úsalas antes de un cambio grande (para poder volver) y después (para revisar qué tocaste). Mensajes de commit cortos y en imperativo.",
    ["git", "commit", "diff", "status", "versionar", "volver"],
    ["manual", "core"]
  ),
  fetch_url: M(
    "man-fetch_url",
    "fetch_url — leer una web",
    "Descarga el texto de una URL http/https pública (sin login) y lo devuelve limpio. No sirve para páginas con sesión iniciada. El motor rechaza direcciones internas por seguridad.",
    ["fetch_url", "web", "url", "descargar", "documentación"],
    ["manual", "core"]
  ),
  pc_info: M(
    "man-pc_info",
    "pc_info — mirar tu PC",
    "Devuelve datos reales de tu equipo (sistema, CPU, RAM, rutas). Úsala antes de proponer comandos específicos de sistema operativo, para no enviar comandos de Linux en Windows.",
    ["pc_info", "sistema", "ram", "cpu", "windows"],
    ["manual", "pc"]
  ),
  pc_exec: M(
    "man-pc_exec",
    "pc_exec — ejecutar en tu PC (no en el sandbox)",
    "Ejecuta un comando REAL en tu PC a través del puente :5000. Diferencia clave: run_command trabaja en la raíz del sandbox (la raíz de datos resuelta al arrancar — `.proyectos` solo cuando no hay otra configurada), pc_exec trabaja en tu máquina. No inventes rutas: si no sabes dónde está algo, pregúntalo o búscalo con pc_list_dir antes. Comandos destructivos: avisa primero. NO uses pc_exec ni findstr para leer el código interno de la IDE (server.ts, src/, manuals.ts) ni para descubrir cómo funciona el sandbox: eso es arqueología que gasta el presupuesto del turno sin producir obra. Para tu PROYECTO usá las herramientas del sandbox (list_files / read_file_range / search_in_files); pc_exec es solo para comandos reales de la máquina que el sandbox no puede hacer. Si necesitás saber QUÉ raíz sirve el :3500, consultá GET http://127.0.0.1:3500/__cn_info — no lo deduzcas con findstr.",
    ["pc_exec", "pc", "windows", "comando", "real", "puente"],
    ["manual", "pc"],
    0.95
  ),
  pc_read_file: M(
    "man-pc_read_file",
    "pc_read_file / pc_write_file / pc_list_dir / pc_delete",
    "Leen y escriben archivos REALES de tu PC. Usa rutas completas con barras correctas para el sistema. Si un archivo no se encuentra, el motor devuelve el error literal: cópialo tal cual al usuario en lugar de inventar una ruta parecida.",
    ["pc_read_file", "pc_write_file", "pc_list_dir", "pc_delete", "ruta", "no se encontró"],
    ["manual", "pc"],
    0.95
  ),
  // v1.71.0 · DOCUMENTOS REALES — PDF/Word/Excel los escribe el motor, no un .txt disfrazado.
  generar_pdf: M(
    "man-generar_pdf",
    "generar_pdf — informe PDF de verdad",
    "Crea un PDF real en el sandbox desde texto con markdown simple (# títulos, - listas, tablas |a|b|, bloques ```código```, **negrita**). Es lo que usas cuando el usuario pide «dame el informe en PDF»: NO escribas un .txt con extensión .pdf (queda corrupto). Recibe {path, contenido, titulo?}; devuelve {ok, path, bytes, paginas}. Si el texto trae emoji o caracteres fuera del latín-1, el resultado lo DECLARA en caracteresSustituidos (se ven como '?'); si molesta, genera .docx en su lugar.",
    ["generar_pdf", "pdf", "informe", "documento", "exportar"],
    ["manual", "documentos"],
    0.95
  ),
  generar_docx: M(
    "man-generar_docx",
    "generar_docx — Word (.docx) editable",
    "Crea un .docx real (Word/LibreOffice/Google Docs lo abren sin reparación) desde el mismo texto con formato. Títulos con estilo navegable, listas, tablas y código. Úsalo para documentos que el usuario va a EDITAR después (un PDF no se edita). Recibe {path, contenido, titulo?}; devuelve {ok, path, bytes}.",
    ["generar_docx", "word", "docx", "documento", "editable"],
    ["manual", "documentos"],
    0.95
  ),
  generar_xlsx: M(
    "man-generar_xlsx",
    "generar_xlsx — hoja de cálculo (.xlsx)",
    "Crea un libro .xlsx desde datos tabulados: {path, hojas:[{nombre?, cabeceras?, filas:[[...]]}]}. Los números salen como números; TODO lo demás sale como TEXTO, nunca como fórmula (un valor hostil que empiece con '=' queda en texto, no se ejecuta). Cabeceras van en negrita y la fila queda congelada. Úsalo para tablas de datos/exports, no para texto corrido (eso va a docx/pdf).",
    ["generar_xlsx", "excel", "xlsx", "hoja de cálculo", "tabla", "datos", "exportar"],
    ["manual", "documentos"],
    0.95
  ),

  // ═══════════════════════════════════════════════════════════════════════
  // v1.0.31 · LAS DIECISÉIS QUE NO TENÍAN MANUAL (P1a de la propuesta v1.1.0)
  //
  // El registro declaraba 46 herramientas y el manual explicaba 30. Las 16 de
  // abajo no se nombraban NUNCA con detalle: el modelo recibía el esquema JSON y
  // cero prosa, que es la definición de «no sabe que la tiene». Peor: cuatro de
  // ellas estaban descritas en otro sitio con datos que su esquema NO permite
  // (XML en `convertir_formato`, disco en `recursos_maquina`, «sesión» en
  // `cerebro_recordar`, «solo con tests verdes» en `git_commit`).
  //
  // REGLA DE ESTA SECCIÓN, y la suite `manualesCobertura` la hace cumplir:
  //   ▸ El manual NO puede prometer nada que el esquema no acepte. Si el enum
  //     dice json|yaml|toml|csv, aquí no aparece XML. Si la herramienta no mide
  //     disco, aquí no se habla de disco. La contradicción manual↔esquema es un
  //     defecto, no un matiz de redacción.
  //   ▸ Cada manual dice QUÉ DEVUELVE y el error típico, porque con un modelo
  //     chico la diferencia entre «llamé» y «funcionó» es todo el turno.
  // ═══════════════════════════════════════════════════════════════════════
  pc_write_file: M(
    "man-pc_write_file",
    "pc_write_file — escribir un archivo en la PC real",
    "Crea o SOBRESCRIBE un archivo en la máquina del usuario (no en el sandbox). Recibe {path, content} con el contenido COMPLETO: si el archivo existía, lo reemplaza entero — para un cambio puntual, lee primero y reescribe con el cambio. La ruta puede ser absoluta o un atajo: 'Desktop/x.txt', 'Documents/…', 'Downloads/…', '~'. Devuelve la ruta final resuelta: si no coincide con lo que pediste, la carpeta no era la que creías. Error típico: usarla para el proyecto del sandbox — ahí van write_file/edit_file.",
    ["pc_write_file", "escribir", "pc", "disco real", "desktop", "descargas", "archivo"],
    ["manual", "pc"],
    0.9
  ),
  pc_list_dir: M(
    "man-pc_list_dir",
    "pc_list_dir — mirar una carpeta de la PC",
    "Lista una carpeta REAL del equipo con {path} (absoluta o atajo 'Desktop', 'Downloads', '~'). Para el sandbox del proyecto no se usa: ahí va list_files. Úsala ANTES de escribir o borrar en la PC: confirma que la carpeta existe, cómo se llama de verdad y qué hay dentro. Devuelve las entradas con su tipo; si la ruta no existe lo dice con el error, no devuelve una lista vacía silenciosa. Error típico: suponer que «Escritorio» existe con ese nombre — en Windows es 'Desktop'.",
    ["pc_list_dir", "listar", "carpeta", "pc", "escritorio", "descargas"],
    ["manual", "pc"],
    0.9
  ),
  pc_delete: M(
    "man-pc_delete",
    "pc_delete — borrar en la PC (DESTRUCTIVA)",
    "Borra un archivo REAL del equipo con {path}. Es DESTRUCTIVA y no tiene papelera: úsala solo si el usuario pidió borrar ESE archivo, y nombra la ruta completa antes de hacerlo. Si dudas, no la llames: pregunta en una línea. Para borrar dentro del proyecto del sandbox existe delete_file. Error típico: borrar por patrón o «limpiar» sin pedido explícito; un archivo del usuario que no vuelve es el fallo más caro de todos.",
    ["pc_delete", "borrar", "eliminar", "destructiva", "pc"],
    ["manual", "pc"],
    0.95
  ),
  git_diff: M(
    "man-git_diff",
    "git_diff — ver qué cambió antes de guardar",
    "Muestra el diff de los cambios sin commitear del proyecto; con {path} lo limita a un archivo. Úsala ANTES de git_commit para saber qué vas a guardar, y después de editar para comprobar que el cambio quedó como querías. Devuelve el diff en texto; si no hay cambios lo dice (no inventa líneas). Error típico: hacer commit a ciegas — un diff de tres líneas enseña más que cualquier suposición.",
    ["git_diff", "diff", "cambios", "git", "revisar"],
    ["manual", "git"],
    0.9
  ),
  git_commit: M(
    "man-git_commit",
    "git_commit — punto de restauración (guarda TODO y hace commit)",
    "Añade TODO al índice y hace commit con {message}. Es un PUNTO DE RESTAURACIÓN, no una revisión: no exige tests verdes ni espera permiso del repositorio, así que lo que entra es lo que hay en disco en ese instante, incluido lo que esté a medias. Por eso: mira git_diff primero y escribe un mensaje que diga QUÉ se guardó. Si el commit falla (sin repositorio, sin identidad configurada), devuelve el error real: no lo presentes como guardado. Error típico: usarlo como «ya está terminado» — guardar no es verificar.",
    ["git_commit", "commit", "guardar", "restauración", "git"],
    ["manual", "git"],
    0.9
  ),
  convertir_formato: M(
    "man-convertir_formato",
    "convertir_formato — convertir datos y DECLARAR lo que se pierde",
    "Convierte texto entre los cuatro formatos soportados: {texto, desde, hacia} con desde/hacia en json | yaml | toml | csv, y opcionales ordenar_claves (booleano) y separador_csv. Devuelve el resultado MÁS un informe de pérdidas: comentarios que se caen, nulos, estructuras anidadas que CSV no puede representar. Úsala en vez de escribir la conversión a mano: es exacta y dice qué se perdió. JSON es el único formato que admite anidamiento completo; al pasar a CSV o TOML lo anidado se aplana o se pierde y eso se declara. Error típico: convertir a CSV y presentar el resultado como equivalente al original sin leer las pérdidas.",
    ["convertir_formato", "convertir", "formato", "json", "yaml", "toml", "csv", "datos"],
    ["manual", "data"],
    0.9
  ),
  ollama_estado: M(
    "man-ollama_estado",
    "ollama_estado — qué modelos están residentes AHORA",
    "Sin argumentos. Dice qué modelos están cargados en RAM/VRAM en este momento y cuántos MB ocupa cada uno (consulta /api/ps de Ollama). Úsala antes de expulsar (para saber qué hay) y después (para confirmar que la expulsión funcionó), y para explicar con números por qué el equipo se calienta o va lento. Devuelve la lista real; si Ollama no responde lo dice con el error, no una lista vacía. Error típico: hablar de «modelos en memoria» sin mirar — esto es la medición, no la suposición.",
    ["ollama_estado", "modelos", "ram", "vram", "residente", "memoria", "ollama"],
    ["manual", "sistema"],
    0.9
  ),
  ollama_expulsar: M(
    "man-ollama_expulsar",
    "ollama_expulsar — descargar un modelo de la memoria",
    "Descarga YA el modelo de RAM/VRAM con keep_alive 0. Con {model} (nombre exacto con tag, tal como lo devuelve ollama_estado) expulsa ese; sin argumentos expulsa TODOS los residentes. NO borra nada del disco: la próxima respuesta vuelve a cargar el modelo sola (y eso cuesta los ~50 s de arranque en frío). Úsala cuando el usuario pida liberar memoria o si un modelo grande quedó clavado. Error típico: expulsar todo en medio de un turno largo y luego quejarse de la lentitud que eso mismo provoca.",
    ["ollama_expulsar", "expulsar", "liberar", "memoria", "ram", "descargar modelo"],
    ["manual", "sistema"],
    0.9
  ),
  recursos_maquina: M(
    "man-recursos_maquina",
    "recursos_maquina — la medida del equipo (CPU y RAM)",
    "Sin argumentos. Devuelve núcleos de CPU, RAM total, RAM libre y los MB residentes de Ollama: lo que hace falta para decidir si conviene bajar a un modelo más chico o para explicar con números una lentitud o un apagón. NO mide disco ni GPU: si el usuario pregunta por espacio libre o por la gráfica, esta herramienta no lo responde y hay que decirlo en vez de inventar una cifra. Error típico: citar «memoria» sin decir cuál — aquí RAM libre y residentes de Ollama son dos números distintos y los dos importan.",
    ["recursos_maquina", "ram", "cpu", "recursos", "lento", "memoria", "equipo"],
    ["manual", "sistema"],
    0.9
  ),
  cerebro_recordar: M(
    "man-cerebro_recordar",
    "cerebro_recordar — guardar en el cerebro de largo plazo",
    "Memoria de LARGO PLAZO: guarda algo que vale la pena recordar ENTRE TURNOS Y ENTRE SESIONES: una decisión de diseño, un patrón del proyecto, una receta que funcionó, una preferencia del usuario. Recibe {tema, titulo, texto} (tema = categoría corta: arranque, proveedores, ui, sandbox, preferencias) y opcional {palabras} con claves extra. Se indexa por tema/título/contexto para poder reencontrarlo sin releer todo. Escribe una vez: guardar lo mismo cinco veces solo ensucia el índice. Error típico: usarlo como bloc de notas del turno — lo que caduca en este turno no se guarda aquí.",
    ["cerebro_recordar", "recordar", "memoria", "guardar", "largo plazo", "cerebro", "aprender"],
    ["manual", "cerebro"],
    0.9
  ),
  cerebro_consultar: M(
    "man-cerebro_consultar",
    "cerebro_consultar — preguntarle al cerebro antes de trabajar",
    "Consulta la memoria de largo plazo: {consulta} en lenguaje natural y opcional {max} (por defecto 4). Enruta la pregunta por tema/título/contexto y devuelve SOLO las entradas pertinentes, no todo el cerebro. Úsala ANTES de empezar una tarea que huele a repetida («¿ya decidimos cómo se arranca el puente?») para no volver a deducir lo ya decidido. Si no hay nada, lo dice: una lista vacía es una respuesta, no un fallo. Error típico: consultarla después de haber reescrito medio proyecto a mano.",
    ["cerebro_consultar", "consultar", "memoria", "recordar", "cerebro", "ya decidimos"],
    ["manual", "cerebro"],
    0.9
  ),
  terminal_abrir: M(
    "man-terminal_abrir",
    "terminal_abrir — una terminal que sigue viva",
    "Abre una terminal PERSISTENTE y devuelve su id. A diferencia de run_command (un solo tiro, sin estado), esta conserva estado entre comandos: cd, variables de entorno, un REPL (python/node/psql) o un proceso que pide entrada por consola. Opcionales {cwd} y {shell} (bash, powershell.exe, cmd.exe). Úsala cuando necesites VARIOS comandos encadenados o responder a preguntas interactivas. Error típico: abrir una terminal por comando — el estado se pierde y quedan shells vivos ocupando memoria.",
    ["terminal_abrir", "terminal", "shell", "repl", "persistente", "interactivo"],
    ["manual", "terminal"],
    0.9
  ),
  terminal_enviar: M(
    "man-terminal_enviar",
    "terminal_enviar — mandar una línea a la terminal viva",
    "Envía una línea a una terminal abierta y devuelve la salida NUEVA tras una breve espera: {id, data} y opcional {reposo_ms} (por defecto 400, máximo 10000; el salto de línea lo añade el motor). Para un prompt interactivo manda SOLO la respuesta (por ejemplo «y»), no la pregunta otra vez. Si el proceso tarda, sube reposo_ms en vez de mandar el comando dos veces: reenviar un comando que ya estaba corriendo es cómo se duplica una instalación. Error típico: leer la salida completa cuando lo que interesa es el tramo nuevo — eso lo da terminal_leer.",
    ["terminal_enviar", "enviar", "comando", "terminal", "interactivo", "reposo"],
    ["manual", "terminal"],
    0.9
  ),
  terminal_leer: M(
    "man-terminal_leer",
    "terminal_leer — mirar sin escribir nada",
    "Lee lo nuevo que salió por la terminal persistente SIN enviar nada: {id}. Devuelve lo acumulado desde la última lectura, que es lo que sirve en un proceso largo (una instalación, un servidor de desarrollo, un build). Úsala para esperar sin teclear y sin reiniciar el proceso. Error típico: usar terminal_enviar con una línea vacía para «ver qué pasó»: eso escribe un Enter en el proceso, y en una instalación ese Enter contesta una pregunta.",
    ["terminal_leer", "leer", "salida", "terminal", "proceso largo", "mirar"],
    ["manual", "terminal"],
    0.9
  ),
  terminal_cerrar: M(
    "man-terminal_cerrar",
    "terminal_cerrar — cerrar la terminal que abriste",
    "Cierra una terminal persistente y libera su proceso: {id}. Es idempotente (cerrar dos veces no falla). CIERRA SIEMPRE al terminar: cada terminal viva es un shell ocupando memoria en un equipo que puede tener 8 GB, y una que queda abierta se lleva el crédito de «la IDE va lenta». Error típico: dejarlas abiertas «por si acaso» — para volver a mirar se abre otra en un segundo.",
    ["terminal_cerrar", "cerrar", "terminal", "liberar", "shell"],
    ["manual", "terminal"],
    0.9
  ),
  terminal_listar: M(
    "man-terminal_listar",
    "terminal_listar — qué terminales están vivas",
    "Sin argumentos. Lista las terminales persistentes vivas con su id, cwd, shell, si el proceso murió y cuántos bytes de salida acumuló. Úsala antes de abrir otra (para reutilizar la que ya está) y al final del turno para comprobar que no quedó ninguna colgada. Devuelve la lista real; una lista vacía significa que no hay ninguna abierta. Error típico: perder el id de una terminal y abrir una segunda para el mismo trabajo.",
    ["terminal_listar", "listar", "terminales", "vivas", "shell", "colgada"],
    ["manual", "terminal"],
    0.9
  ),
};

// ============================================================
// 3. PROCEDIMIENTOS — recetas para los trabajos frecuentes
// ============================================================
export const PROCEDURES: KbEntry[] = [
  M(
    "proc-motor-3d",
    "Procedimiento: armar una escena 3D que se pueda mover (motor local, sin CDN)",
    "El motor 3D de la casa YA VIENE con el programa: three.js r169 en «vendor/three/three.module.js» y los complementos en «vendor/three/addons/». No se baja de unpkg, jsdelivr ni esm.sh: la previsualización corre en 127.0.0.1:3500 y la cerradura (regla «csp-ausente») empuja a Content-Security-Policy «default-src 'self'», que corta cualquier CDN. PASOS: 1) Preparar el motor con «npm run vendor:3d» (copia vendor/three a la raiz de datos, que es la segunda base con la que resuelve el sandbox; es idempotente y sale con codigo distinto de cero si no verifica: si falla, la escena va a salir NEGRA y eso se INFORMA, no se disfraza). 2) Crear la obra con crear_sitio y escribir TRES archivos con crear_archivo: index.html, estilo.css y main.js — el JavaScript va SIEMPRE afuera, nunca en un <script> sin src. 3) En index.html, ANTES del modulo, declarar el mapa de importaciones: <script type='importmap'> con imports = { 'three': '/vendor/three/three.module.js', 'three/addons/': '/vendor/three/addons/' }, y despues <script type='module' src='main.js'>. Los complementos (OrbitControls) importan 'three' pelado: sin el mapa no resuelven y el error llega como pantalla negra sin texto. 4) Montar la escena: WebGLRenderer con antialias, setPixelRatio(Math.min(devicePixelRatio, 2)), PerspectiveCamera(60, ancho/alto, 0.1, 2000), una hemisphereLight mas una directionalLight, y geometria procedural (no se inventan modelos externos que no estan en disco). 5) Resize atado a ResizeObserver, no a window.onresize pelado. 6) Movimiento por scroll: progreso = scrollY / (document.documentElement.scrollHeight - innerHeight), aplicado a la camara con interpolacion suave por cuadro (lerp); el documento necesita altura real (un div de 300vh) o el scroll no existe. 7) Modo recorrido (subirse a algo): el camino se muestrea con CatmullRomCurve3.getPointAt(t), que esta parametrizado por LONGITUD DE ARCO; getPoint(t) no lo esta y hace que el vehiculo se frene y se acelere en las curvas cerradas. La orientacion sale de un Matrix4.lookAt con un vector arriba estable (tomar el arriba de la tangente produce alabeo). 8) Publicar el estado en el DOM: data-motor='three-r169', data-progreso='<0..1>', data-fotograma='<n>' en el canvas o en un nodo hermano. 9) Al cerrar el recorrido: cancelar requestAnimationFrame y hacer dispose() de geometrías, materiales y texturas (el origen del preview se comparte entre obras y una escena vieja sigue gastando GPU). 10) Verificar con previsualizar_sitio + auditar_pagina y recien entonces preflight_rendimiento.",
    ["3d", "tres d", "three", "three.js", "webgl", "webgpu", "escena 3d", "escena", "camara", "camera", "scroll", "recorrer", "recorrido", "viaje", "carrito", "blender", "modelado", "modelar", "geometria", "malla", "mesh", "shader", "render 3d", "orbitar", "orbitcontrols", "catmullrom", "spline", "curva 3d", "canvas 3d", "montaña rusa", "montana rusa", "subirme", "vista 3d", "volumen 3d"],
    ["procedimiento", "web", "3d", "sandbox", "creador"],
    0.97
  ),
  M(
    "proc-motor-3d-verificar",
    "Verificar una escena 3D: dos fotogramas distintos, no un adverbio",
    "Una escena 3D NO se aprueba porque el archivo se escribió. Antes de decir que la obra funciona: 1) «node scripts/preparar-vendor-3d.mjs --verificar» sale 0 y reporta los dos archivos verificados (si alguien mutilo el motor, aca se ve; el 404 de /vendor/three/three.module.js es la pantalla negra). 2) En el HTML: hay importmap, hay CSP local y NO hay ningun <script> con codigo adentro (0 coincidencias de <script> sin src). 3) Abierta la obra: data-motor dice three-r169 y data-fotograma SUBE entre dos lecturas sucesivas (si no sube, no hay bucle de animacion: hay una imagen congelada). 4) Movimiento real: con el scroll en 20% y en 80%, data-progreso cambia y la imagen del lienzo es DISTINTA. Eso es el movimiento; «se mueve suave» sin las dos lecturas es una afirmacion regalada. 5) En modo recorrido, probar el punto medio de una curva cerrada: si el encuadre alabea, se esta usando getPoint(t) en lugar de getPointAt(t) o el vector arriba sale de la tangente. 6) preflight_rendimiento no reporta geometrías sin dispose ni relacion de aspecto loca; el pixel ratio queda capado en 2. Si algo de esto no se pudo medir, se dice cual falta y por que — la skill cn-web-escena-3d y la valla tests/escena3dCableada.test.ts son la misma regla en dos lados.",
    ["verificar 3d", "escena negra", "pantalla negra", "no se ve", "no carga three", "404 vendor", "importmap", "fotograma", "data-progreso", "comprobar 3d", "animacion congelada", "dispose", "pixel ratio"],
    ["procedimiento", "web", "3d", "verificacion"],
    0.96
  ),
  M(
    "proc-analisis-previo",
    "Procedimiento: ANALIZAR antes de actuar (no hacer cagadas)",
    "Antes de crear o modificar nada: 1) MIRA lo que ya existe con list_files y lee los archivos que vas a tocar (read_file / read_file_range); no supongas su contenido. 2) ENTIENDE qué pide EXACTAMENTE el usuario y qué no; si hay ambigüedad real, pregunta en una línea. 3) PLAN corto en 1-3 frases: qué archivos y por qué (usa set_plan si son >2 pasos). 4) RIESGOS: no pises ni borres lo que funciona; prefiere edit_file a reescribir entero; lo destructivo se avisa. 5) Hazlo por partes y VERIFICA (relee / compila / abre el preview); si no pudiste verificar, dilo. Regla de oro: varía el resultado según el pedido, no repitas siempre la misma plantilla.",
    ["analizar", "analiza", "antes de", "plan", "planificar", "riesgo", "verificar", "cagada", "pensar"],
    ["procedimiento", "motor"],
    0.95
  ),
  M(
    "proc-ui-variada",
    "Procedimiento: construir interfaz variada (botones, perillas, ventanas, vídeo)",
    "Elige cada componente por su FUNCIÓN y varía el diseño: botones (enlace <a> para redirigir, <button> para acción JS, submit, toggle con aria-pressed, FAB con aria-label); volumen (slider <input type=range> o perilla redonda role=slider que gira con rotate según el valor 0..100); ventanas (<dialog> nativo con showModal, drawer lateral, popover, toast); vídeo (<video controls> para archivo propio con autoplay+muted, o iframe de YouTube con /embed/ envuelto en contenedor 16:9). La lógica SIEMPRE con addEventListener, nunca con on* en línea ni href=javascript:. Mira el recetario de componentes web para el código exacto. Fallo típico de pestañas 'que no hacen nada': el id del data-tab no coincide o el script corre antes del DOM.",
    ["boton", "botones", "perilla", "knob", "slider", "volumen", "modal", "ventana", "video", "iframe", "interfaz", "ui", "componente", "pestaña", "tabs"],
    ["procedimiento", "web", "ui"],
    0.9
  ),
  M(
    "proc-web-page",
    "Procedimiento: crear una página web",
    "1) list_files para ver la estructura. 2) Busca la plantilla o el index existente (search_in_files «<!DOCTYPE» o «createRoot»). 3) Escribe o edita los archivos por partes: estructura HTML, estilos CSS, lógica JS. 4) Dile al usuario que sincronice (o sincroniza) para ver el preview en :3500. 5) Si el preview sale vacío, comprueba que el servidor del sandbox esté arrancado y que exista un package.json en la raíz del proyecto.",
    ["página web", "html", "css", "web", "preview", "plantilla", "crear web"],
    ["procedimiento", "web"],
    0.9
  ),
  M(
    "proc-fix-build",
    "Procedimiento: arreglar un error de compilación",
    "1) Lee el error COMPLETO (archivo, línea, mensaje): run_command del build o el log del sandbox. 2) Abre el archivo y solo el tramo indicado con read_file_range. 3) Identifica la causa (casi siempre: falta una llave o paréntesis, un import roto, o un archivo truncado a medias). 4) Corrige con edit_file. 5) Vuelve a compilar. Nunca «arregles» reescribiendo el archivo entero a ciegas.",
    ["error", "compilar", "build", "syntax", "no compila", "expected"],
    ["procedimiento", "web"],
    0.95
  ),
  M(
    "proc-truncated-file",
    "Procedimiento: archivo truncado ('archivo truncado a 100 KB')",
    "Ese texto lo añade el propio IDE al recortar archivos grandes. Si aparece en un archivo o en tu respuesta, el archivo está ROTO. Solución: no reescribas todo; localiza dónde falta contenido, y crea el resto con append_file o corrige el tramo con edit_file. El motor rechaza cualquier escritura que contenga ese marcador.",
    ["truncado", "100 KB", "archivo roto", "incompleto", "cortado"],
    ["procedimiento", "motor"],
    0.95
  ),
  M(
    "proc-sandbox-no-package",
    "Procedimiento: el sandbox dice 'no se encontró package.json'",
    "Significa que en la RAÍZ del proyecto no hay package.json. Causas habituales: (a) subiste el ZIP de la IDE en vez del proyecto; (b) el ZIP traía una carpeta contenedora y el proyecto quedó un nivel más adentro (ej. Proyecto/ide/backend/package.json). Comprueba con list_files y busca dónde está de verdad el package.json; si está en una subcarpeta, usa ESA carpeta como raíz del proyecto o sube de nuevo el ZIP sin la carpeta contenedora.",
    ["package.json", "sandbox", "no se encontró", "raíz", "proyecto", "sync"],
    ["procedimiento", "sandbox"],
    0.95
  ),
  M(
    "proc-model-without-tools",
    "Procedimiento: modelo demasiado pequeño para herramientas",
    "Si el motor dice que el modelo no tiene herramientas (menos de ~4 B de parámetros), el modelo NO puede leer archivos, ejecutar comandos ni crear nada: solo escribe texto. En ese caso: no pidas tareas de proyecto, avisa al usuario de que cambie a un modelo mayor (≥4 B) o a la nube (GLM-4.7-Flash), y limítate a explicar o resumir.",
    ["modelo pequeño", "sin herramientas", "0.5b", "270m", "no puede", "local"],
    ["procedimiento", "motor"],
    0.95
  ),
  M(
    "proc-supervivencia",
    "Procedimiento: cuando no puedes hacer algo",
    "Di exactamente qué te falta y qué necesitas para continuar: la clave de un servicio, un archivo concreto, permiso para algo destructivo, o un modelo con más capacidad. Nunca rellenes el hueco con una invención ni con datos de ejemplo presentados como reales.",
    ["no puedo", "falta", "necesito", "permiso", "clave", "bloqueado"],
    ["procedimiento", "motor"],
    0.9
  ),
];

/** Todas las entradas del manual, para sembrar la base de conocimiento. */
export const MANUAL_ENTRIES: KbEntry[] = [...ENGINE_LAWS, ...Object.values(TOOL_MANUALS), ...PROCEDURES];

/**
 * Sección compacta que se inyecta en el prompt: las leyes + el manual de las
 * herramientas que este modelo tiene activas. Se dimensiona al presupuesto que
 * le toque al modelo (los micro no llegan aquí: no tienen herramientas).
 */
export function buildToolManualSection(toolNames: string[], budgetChars = 1400): string {
  if (!toolNames || toolNames.length === 0) return "";
  const laws = ENGINE_LAWS.slice(0, 3)
    .map((l) => `- ${l.body.split(".")[0]}.`)
    .join("\n");

  const lines: string[] = [];
  for (const name of toolNames) {
    const m = TOOL_MANUALS[name];
    if (!m) continue;
    // Primera frase: el cuándo; segunda: el cómo y el error típico.
    const sentences = m.body.split(/(?<=\.)\s+/);
    const brief = sentences.slice(0, 2).join(" ");
    lines.push(`- ${name}: ${brief}`);
  }

  let text = `[MANUAL DEL MOTOR — LEE ESTO ANTES DE USAR HERRAMIENTAS]\n${laws}\n\n${lines.join("\n")}`;
  if (text.length > budgetChars) text = text.slice(0, budgetChars) + "\n[…manual recortado: pide el detalle con el nombre de la herramienta…]";
  return text;
}

// ============================================================
// 4. EL CONTRATO DE ACCIÓN — UN ESTÁNDAR, NO UN DIALECTO POR MODELO · v1.67.0
// ============================================================
// POR QUÉ ESTO EXISTE (la observación es de Mario, y es de arquitectura):
//   «La interfaz no solo debe ser a gusto del usuario: las IAs también tienen su
//    propia forma de interpretar. La clave está en escribir en standard, o algo
//    que todos sepan usar con certeza.»
//
// DIAGNÓSTICO. El motor era un políglot defensivo. `extraerLlamadasEnTexto`
// ACEPTA seis formas (valla `cerebronico:x`, valla `tool_code`, pseudo-XML
// `<dots_function_call>`, nombre+JSON pelado, paréntesis `x({...})` y estilo
// atributo `x clave="valor"`), y `ALIAS_NOMBRE_HERRAMIENTA` + `normalizarArgsAlias`
// aceptan español e inglés. Todo eso está bien del lado del MOTOR — tolerar la
// entrada ajena es correcto. Del lado del MODELO era otro asunto: seis formas
// posibles y ninguna dicha por delante es exactamente "interpretar a su manera".
// Y encima el manual llegaba recortado a 800 caracteres en nube rápida, o no
// llegaba: `buildToolManualSection` se llamaba detrás de
// `if (herramientasV8.length > 0)`, y `getToolsForModel` devuelve `[]` cuando el
// perfil no es `toolCapable` (server.ts:1875). Las leyes viajan DENTRO de ese
// manual, incluida la que dice «si un nombre no está en el manual, esa
// herramienta NO existe: no la llames». O sea: el modelo que más lo necesitaba
// era el que recibía menos, y la docencia llegaba en
// `construirDirectivaResultadosTextuales` — o sea DESPUÉS de fallar.
//
// EL ESTÁNDAR (una sola cosa, para todos, siempre igual):
//   1. El vocabulario canónico: nombres en inglés, claves en inglés.
//   2. Una sola forma de emitir una acción: valla con el nombre + un objeto JSON.
//   3. Rutas relativas al proyecto. Nunca rutas de disco del usuario.
//   4. Una acción por turno, y ESPERAR su resultado. Si el resultado no llega,
//      la acción NO ocurrió. (Esta cláusula es la que hace que el contrato sea
//      honesto incluso donde el turno no puede ejecutar nada — ver
//      `src/engine/ejecucionFantasma.ts`.)
// El español sigue valiendo: no se le pide al modelo que se adapte a nosotros, se
// le dice cuál es el estándar y se le garantiza que el motor entiende el suyo.
//
// NO es un módulo nuevo: son datos en la misma fuente que ya tenía las leyes.
// ────────────────────────────────────────────────────────────────────────────

/** El formato canónico. El motor acepta otros; este es el que se ENSEÑA. */
export const CONTRATO_DE_ACCION =
  "[CONTRATO DE ACCIÓN — idéntico para todos los modelos y proveedores]\n" +
  "1. NOMBRES y CLAVES en inglés, EXACTOS. Si un nombre no está listado, NO existe: no lo inventes ni lo deletrees.\n" +
  "2. Una acción = una valla con el nombre y UN objeto JSON:\n" +
  "```cerebronico:write_file\n" +
  '{"path":"index.html","content":"<!doctype html>..."}\n' +
  "```\n" +
  'Claves: read_file {"path"} · edit_file {"path","find","replace"} · run_command {"command"} · list_files {}\n' +
  "3. Rutas RELATIVAS al proyecto (\"index.html\", \"src/app.js\"). NUNCA \"C:\\\\Users\\...\" ni \"/home/...\".\n" +
  "4. UNA acción por turno y ESPERA su resultado en prosa. Si no recibiste resultado, NO la hiciste: no lo afirmes. Falló → di el error tal cual.\n" +
  "5. Puedes escribir en español; el motor traduce: crear_archivo=write_file, leer_archivo=read_file, list_dir/ls=list_files, borrar_archivo=delete_file, ejecutar=run_command; ruta=path, contenido=content, comando=command, buscar=find, reemplazar=replace.";

/** Las leyes, en su forma completa (la del manual recortado deja de ser la única). */
function leyesCompletas(): string {
  return ENGINE_LAWS.map((l) => `- ${l.title}: ${l.body}`).join("\n");
}

/** Inventario canónico: nombre + primera frase del manual de cada herramienta. */
function inventarioCanonico(toolNames: string[]): string[] {
  return (toolNames || [])
    .filter((n) => TOOL_MANUALS[n])
    .map((n) => {
      const primera = String(TOOL_MANUALS[n].body).split(/(?<=\.)\s+/)[0];
      return `- ${n}: ${primera}`;
    });
}

export type CanalAccion = "nativo" | "texto" | "ninguno";

/**
 * Proveedores cuyo turno pasa por `ejecutarCicloHerramientasOpenAICompat`, que es
 * el ÚNICO sitio donde `extraerLlamadasEnTexto` convierte texto en acción. Fuera
 * de ellos no se le puede ofrecer el canal de texto: sería prometerle al modelo
 * una mano que el turno no tiene (y para eso ya está `guardaSinHerramientas()`).
 */
export const PROVEEDORES_SIN_CICLO_DE_TEXTO = new Set(["ollama", "gemini"]);

/**
 * El bloque que se inyecta en TODAS las rutas, armado con el mismo estándar.
 * `canal` sólo cambia la línea de TRANSPORTE (por dónde llega la acción); el
 * vocabulario, el formato, las rutas y las leyes son los mismos caracteres para
 * un gemma local que para GLM: eso es lo que da certeza al modelo y economía al
 * mantenimiento (una cláusula que arreglar, no once).
 *
 * `conManual`: el inventario herramienta-por-herramienta. Con canal nativo ya
 * existe (es `buildToolManualSection`); con canal de texto es lo que faltaba.
 */
export function buildContratoDeAccion(opts: {
  /** Herramientas ofrecidas por el canal nativo del protocolo (vacío si no es toolCapable). */
  nombresNativos: string[];
  /** Todo lo que el motor sabría ejecutar (para el caso texto). */
  nombresEjecutables: string[];
  /** El proveedor del turno: decide si existe el canal de texto. */
  provider?: string;
  presupuesto?: number;
}): string {
  const nativos = (opts.nombresNativos || []).filter(Boolean);
  const proveedor = String(opts.provider || "").toLowerCase();
  let canal: CanalAccion;
  if (nativos.length > 0) canal = "nativo";
  else if (PROVEEDORES_SIN_CICLO_DE_TEXTO.has(proveedor)) canal = "ninguno";
  else canal = "texto";
  // Sin canal de acción NO se promete acción: ahí manda `guardaSinHerramientas()`
  // («si no tienes herramientas, di que no puedes»). Dos órdenes contradictorias en
  // el mismo system prompt es justo lo que produce modelos que dudan de todo.
  if (canal === "ninguno") return "";

  const nombres = canal === "nativo" ? nativos : (opts.nombresEjecutables || []).filter(Boolean);
  // SUELO DEL ESTÁNDAR. El presupuesto que llega de server.ts (800 en nube rápida)
  // se dimensionó para el MANUAL VIEJO, que recortaba las leyes a su primera
  // oración. Aplicárselo al contrato cortaba la cláusula 4 a mitad de frase — y la
  // cláusula 4 («si no recibiste resultado, NO la hiciste») es justamente la que
  // impide el «✔ creado» inventado que Mario reporta. Recortar la cláusula que
  // evita las mentiras para ahorrar 600 caracteres es un cambio perdedor.
  // El coste real: ~700 caracteres ≈ 200 tokens sobre una ventana de nube de
  // 220 000 (v1.55.0). Lo que flexiona con el presupuesto es el INVENTARIO.
  const presupuesto = Math.max(Math.round(opts.presupuesto ?? 1500), 1450);
  const transporte =
    canal === "nativo"
      ? "Tus herramientas van por el CANAL DE FUNCIONES del protocolo: usa el nombre y el esquema exactos."
      : "Sin canal de funciones: EMITE la accion como TEXTO dentro de tu respuesta, con la valla del punto 2. El motor la detecta y la ejecuta.";

  // La parte FIJA es el estándar: llega completa o no llega. Lo que flexiona con
  // el presupuesto del modelo es el INVENTARIO, nunca las reglas — un modelo al
  // que se le recorta el punto 4 («si no recibiste resultado, no lo hiciste») es
  // un modelo al que se le recorta justamente la cláusula que impide que mienta.
  const leyesEnteras = leyesCompletas();
  const fijo = `${CONTRATO_DE_ACCION}\n\nTRANSPORTE EN ESTE TURNO: ${transporte}\n\nLEYES DEL MOTOR:\n${leyesEnteras}`;
  const leyesCompactas = ENGINE_LAWS.map((l) => `- ${l.title}`).join("\n");
  const base = fijo.length <= presupuesto
    ? fijo
    : `${CONTRATO_DE_ACCION}\n\nTRANSPORTE EN ESTE TURNO: ${transporte}\n\nLEYES DEL MOTOR:\n${leyesCompactas}`;

  const inv = inventarioCanonico(nombres);
  if (!inv.length || base.length >= presupuesto) return base;

  // Se RESERVA sitio para el aviso antes de llenar: añadirlo al final y recortar
  // devolvía un bloque que moría en «[…inventario r» — ruido disfrazado de aviso.
  const encabezado = "\n\nHERRAMIENTAS DE ESTE TURNO:\n";
  const avisoPara = (faltan: number, total: number) =>
    `\n[…inventario recortado: ${faltan} de ${total}. Ante la duda sobre una que no ves, pregunta en una línea en vez de inventar el nombre.]`;
  const reserva = avisoPara(inv.length, inv.length).length;
  const limite = presupuesto - reserva;
  let texto = base;

  const guardadas: string[] = [];
  for (const linea of inv) {
    // ANCHO NUMÉRICO, no el string: poner "\n" aquí hacía que la suma concatenara
    // en vez de sumar, `probar` dejara de ser comparable y el bucle llenara sin
    // parar (medido: 3349 caracteres con presupuesto 1900). El corte de seguridad
    // de abajo sigue; esto es la causa.
    const probar = texto.length + (guardadas.length ? 1 : encabezado.length) + linea.length;
    if (probar > limite) break;
    texto += (guardadas.length ? "\n" : encabezado) + linea;
    guardadas.push(linea);
  }
  if (guardadas.length < inv.length) texto += avisoPara(inv.length - guardadas.length, inv.length);
  // Corte de seguridad: el techo es un TECHO. Si el inventario lo desbordara por
  // cualquier cuenta mal hecha, se devuelve el estándar completo SIN inventario
  // (1427 car.) antes que un bloque que revienta la ventana del modelo. Medido en
  // la primera corrida: con presupuesto 1900 devolvía 3349 — el bucle sumaba sobre
  // el largo equivocado. Un techo que no se cumple no es un techo.
  return texto.length <= presupuesto ? texto : base;
}
