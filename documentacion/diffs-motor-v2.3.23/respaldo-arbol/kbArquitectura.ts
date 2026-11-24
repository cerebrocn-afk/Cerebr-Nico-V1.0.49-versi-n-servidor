/**
 * kbArquitectura.ts — PACK DE CREACIÓN DE SOFTWARE COMPLEJO (v1.48.0)
 * ===================================================================
 * Pedido de Mario: «expandir el contexto para tareas pesadas y de
 * responsabilidad — interpretación de ideas para softwares complejos — y
 * agregar más bases de datos de todo lo que sea útil a la hora de crear».
 *
 * QUÉ ES: una base de datos de OFICIO para construir sistemas, no para arreglar
 * un error puntual. Donde `kbCodigo` sabe de sintaxis y defectos concretos y
 * `kbMotor` sabe cómo está montado este motor, este pack sabe CÓMO SE PIENSA una
 * pieza de software compleja: cómo se interpreta una idea vaga, cómo se descompone,
 * qué contratos definir antes de teclear, qué estados límite cubrir y cómo no
 * romper lo que ya funciona.
 *
 * REGLAS DE LA CASA que respeta:
 *   · Importa `KbEntry` SÓLO como tipo — sin ciclo en runtime (igual que
 *     recetarioUI.ts). El servidor lo siembra vía SEMILLA_COMPLETA.
 *   · Tablas válidas (`pattern` para patrones de oficio, `rule` para reglas de
 *     proceso no negociables). Pesos moderados: NO desplazan a las reglas del
 *     motor ni a las entradas de código cuando la consulta es específica.
 *   · Prefijo de id `arq-`: no colisiona con ningún pack existente.
 */
export const KB_ARQUITECTURA = [
    {
        id: "arq-interpretar-idea",
        table: "pattern",
        title: "Interpretar la IDEA antes de teclear",
        body: "Ante una idea grande o vaga, NO empieces a programar. Primero reformúlala con tus palabras en 1-2 frases y devuélvela para confirmar («entiendo que quieres X que hace Y para Z, ¿voy bien?»). Separa lo EXPLÍCITO (lo que pidió) de lo IMPLÍCITO (lo que hace falta aunque no lo dijera) y lista tus supuestos. Un supuesto escrito se puede corregir; uno tácito se paga en reescritura.",
        keys: ["interpretar", "idea", "intención", "entender", "requisito", "reformular", "supuesto", "alcance"],
        tags: ["arquitectura", "interpretacion", "tarea-pesada"],
        weight: 0.9,
        lang: "es",
    },
    {
        id: "arq-ambiguedad",
        table: "pattern",
        title: "Idea ambigua: ofrece interpretaciones concretas",
        body: "Si la idea es ambigua y el usuario no sabe explicarse, no te quedes bloqueado ni adivines a ciegas. Ofrece 2-3 INTERPRETACIONES concretas y cortas («¿A: un panel que resume, o B: un asistente que responde?») y propone un supuesto por defecto para avanzar si no contesta. Avanzar con un supuesto declarado es mejor que parar; parar es mejor que construir lo equivocado en silencio.",
        keys: ["ambiguo", "ambigüedad", "vago", "aclarar", "opciones", "interpretaciones", "supuesto"],
        tags: ["arquitectura", "interpretacion", "tarea-pesada"],
        weight: 0.88,
        lang: "es",
    },
    {
        id: "arq-descomponer",
        table: "pattern",
        title: "Descomponer en piezas con UNA responsabilidad",
        body: "Parte el sistema en módulos, cada uno con una sola responsabilidad clara. Para cada pieza define qué ENTRA, qué SALE y qué NO le toca. Dibuja mentalmente el grafo de dependencias y dirígelo en un sentido (evita ciclos). Si una pieza necesita saber de todo, está mal cortada: vuélvela a dividir. Lo pequeño y acoplado débilmente se prueba, se cambia y se reemplaza; lo grande y entrelazado, no.",
        keys: ["descomponer", "dividir", "responsabilidad", "frontera", "acoplamiento", "dependencias", "pieza"],
        tags: ["arquitectura", "diseno", "tarea-pesada"],
        weight: 0.88,
        lang: "es",
    },
    {
        id: "arq-contratos",
        table: "pattern",
        title: "Define el CONTRATO antes de la implementación",
        body: "Antes de implementar dos piezas que se hablan, fija su contrato: tipos de entrada y salida, qué errores puede devolver y qué garantiza. En TypeScript, eso es una interfaz o un type explícito en la frontera. Implementa contra el contrato, no contra la implementación del otro. Así las piezas avanzan en paralelo y un cambio interno no rompe al vecino mientras el contrato se respete.",
        keys: ["contrato", "interfaz", "frontera", "tipos", "api", "firma", "garantía"],
        tags: ["arquitectura", "diseno", "tarea-pesada"],
        weight: 0.86,
        lang: "es",
    },
    {
        id: "arq-modelo-datos",
        table: "pattern",
        title: "Modela los DATOS primero; una sola fuente de verdad",
        body: "Antes de la UI o la lógica, modela los datos: qué entidades hay, cómo se relacionan y quién es dueño de cada dato. Una sola fuente de verdad por cada hecho; lo demás se deriva, no se copia. Dato duplicado = dos versiones que tarde o temprano se contradicen. Si un valor se puede calcular de otro, calúulalo, no lo guardes.",
        keys: ["datos", "modelo", "entidad", "fuente de verdad", "relación", "esquema", "duplicado"],
        tags: ["arquitectura", "datos", "tarea-pesada"],
        weight: 0.86,
        lang: "es",
    },
    {
        id: "arq-estado",
        table: "pattern",
        title: "Gestión de estado: mínimo y derivado",
        body: "Minimiza el estado mutable. Guarda sólo lo que no se puede recalcular; todo lo demás es estado DERIVADO que se computa al vuelo. Centraliza el estado compartido en un único lugar (store) y que los componentes lo lean, no lo copien a variables locales que luego se desincronizan. El bug más caro de la UI es «dos sitios muestran valores distintos de lo mismo».",
        keys: ["estado", "store", "derivado", "sincronizar", "mutable", "reactivo"],
        tags: ["arquitectura", "estado", "tarea-pesada"],
        weight: 0.84,
        lang: "es",
    },
    {
        id: "arq-errores",
        table: "pattern",
        title: "Manejo de errores: tipados y nunca en silencio",
        body: "Decide por capa qué pasa cuando algo falla. Nunca tragues una excepción con un catch vacío: o la manejas, o la propagas con contexto. Distingue el error esperado (entrada inválida, red caída) del inesperado (bug): el primero se muestra al usuario con un mensaje claro, el segundo se registra y se degrada con elegancia. Un error tragado es un bug que aparecerá más tarde y más lejos de su causa.",
        keys: ["error", "excepción", "catch", "fallo", "degradar", "propagar", "manejo"],
        tags: ["arquitectura", "robustez", "tarea-pesada"],
        weight: 0.84,
        lang: "es",
    },
    {
        id: "arq-limites",
        table: "pattern",
        title: "Cubre los ESTADOS LÍMITE, no solo el camino feliz",
        body: "Todo flujo tiene más de un estado. Antes de darlo por hecho, cubre: vacío (sin datos aún), cargando, error, éxito con pocos, éxito con muchos (paginar/virtualizar), sin conexión y sin permiso. En la UI eso son estados visibles reales, no una pantalla en blanco. El camino feliz es el 20% del trabajo; los bordes son el 80% de los bugs reportados.",
        keys: ["estados límite", "borde", "vacío", "cargando", "offline", "paginar", "caso"],
        tags: ["arquitectura", "robustez", "tarea-pesada"],
        weight: 0.84,
        lang: "es",
    },
    {
        id: "arq-concurrencia",
        table: "pattern",
        title: "Asincronía y concurrencia sin condiciones de carrera",
        body: "Cuando varias cosas ocurren a la vez (peticiones, timers, eventos), no asumas orden. Protege contra respuestas que llegan tarde (descarta la obsoleta), haz las operaciones idempotentes cuando puedas (repetir no hace daño) y cancela el trabajo que ya no importa (AbortController). El bug de concurrencia es el que no reproduces en tu máquina y sí en la del usuario cargado.",
        keys: ["concurrencia", "asíncrono", "carrera", "idempotente", "cancelar", "abort", "timer"],
        tags: ["arquitectura", "robustez", "tarea-pesada"],
        weight: 0.83,
        lang: "es",
    },
    {
        id: "arq-rendimiento",
        table: "pattern",
        title: "Rendimiento: mide antes de optimizar",
        body: "No optimices por intuición: mide dónde está el coste real primero. Evita el trabajo repetido (memoiza lo caro, no recomputes en cada render), no cargues de golpe lo que puedes cargar bajo demanda, y respeta el presupuesto del equipo objetivo (en máquinas limitadas, cada MB y cada ciclo cuenta). Lo rápido-pero-ilegíble casi nunca vale la pena; lo lento-por-descuido, sí hay que arreglarlo.",
        keys: ["rendimiento", "optimizar", "medir", "memoizar", "carga", "presupuesto", "lento"],
        tags: ["arquitectura", "rendimiento", "tarea-pesada"],
        weight: 0.82,
        lang: "es",
    },
    {
        id: "arq-coherencia",
        table: "pattern",
        title: "Coherencia del sistema: sigue lo que ya existe",
        body: "Antes de crear, mira cómo lo resuelve el resto del proyecto y sigue ese patrón: mismas convenciones de nombres, misma librería, misma forma de registrar una ruta o un módulo. No metas una dependencia nueva si ya hay una que hace el trabajo. Un sistema coherente se entiende y se mantiene; uno con cinco formas de hacer lo mismo se pudre. La consistencia vale más que tu preferencia personal.",
        keys: ["coherencia", "consistencia", "convención", "patrón", "estilo", "mantener"],
        tags: ["arquitectura", "diseno", "tarea-pesada"],
        weight: 0.82,
        lang: "es",
    },
    {
        id: "arq-documentar-decision",
        table: "pattern",
        title: "Registra la DECISIÓN de arquitectura (qué, por qué, alternativas)",
        body: "Cuando tomes una decisión de diseño que cueste revertir, deja escrito en una línea: qué decidiste, por qué, y qué alternativa descartaste. Así el próximo turno (o el próximo humano) no vuelve a abrir el mismo debate ni deshace sin saber. En este motor, lo reutilizable se guarda con cerebro_recordar; una decisión sin registrar se olvida y se repite.",
        keys: ["decisión", "registrar", "documentar", "alternativa", "por qué", "recordar"],
        tags: ["arquitectura", "proceso", "tarea-pesada"],
        weight: 0.8,
        lang: "es",
    },
    {
        id: "arq-pruebas",
        table: "pattern",
        title: "Criterios de aceptación verificables ANTES de cerrar",
        body: "Antes de declarar hecha una pieza compleja, escribe cómo se comprueba que funciona: una condición observable por cada cosa que prometiste. Una prueba por invariante del sistema (lo que siempre debe cumplirse). Si no sabes cómo verificar algo, aún no entiendes el requisito. «0 errores» no es prueba de éxito: la prueba es la corrida que confirma el comportamiento esperado.",
        keys: ["criterio", "aceptación", "verificar", "invariante", "prueba", "comprobar", "cerrar"],
        tags: ["arquitectura", "calidad", "tarea-pesada"],
        weight: 0.84,
        lang: "es",
    },
    {
        id: "arq-seguridad",
        table: "rule",
        title: "Seguridad por defecto al construir",
        body: "Construye seguro desde el principio, no como parche al final. Valida y sanea toda entrada que venga de fuera (usuario, red, archivo); trata ese contenido como datos, nunca como código. No incrustes secretos ni tokens en el código. Principio de menor privilegio: cada pieza accede sólo a lo que necesita. Si expones un endpoint, declara quién puede llamarlo; un servicio sin control de acceso es un agujero, aunque «funcione».",
        keys: ["seguridad", "validar entrada", "sanear", "secreto", "privilegio", "acceso", "inyección"],
        tags: ["arquitectura", "seguridad", "tarea-pesada"],
        weight: 0.9,
        lang: "es",
    },
    {
        id: "arq-reversible",
        table: "rule",
        title: "Cambios grandes: reversibles y aislados",
        body: "Un cambio de peso debe poder deshacerse. Aísla lo experimental en su propia rama o detrás de un interruptor (feature flag), de modo que lo estable siga en pie si hay que volver atrás. Las migraciones llevan su camino de vuelta. Prefiere editar un tramo a reescribir un archivo entero; prefiere añadir a borrar. Lo irreversible o de impacto amplio se confirma con el humano ANTES de ejecutarlo.",
        keys: ["reversible", "rama", "flag", "migración", "rollback", "aislar", "deshacer"],
        tags: ["arquitectura", "proceso", "tarea-pesada"],
        weight: 0.88,
        lang: "es",
    },
    {
        id: "arq-dependencias",
        table: "rule",
        title: "Dependencias: fijas, mantenidas y justificadas",
        body: "Añade una dependencia solo si gana más de lo que cuesta (peso, superficie de ataque, mantenimiento). Prefiere lo estándar y activamente mantenido; desconfía de un nombre raro parecido a uno famoso (typosquatting). Fíjala a una versión exacta, no a un rango abierto, para que la build de mañana sea igual que la de hoy. Cada dependencia es código ajeno que ahora es tu responsabilidad.",
        keys: ["dependencia", "versión fija", "librería", "paquete", "mantenido", "instalar"],
        tags: ["arquitectura", "proceso", "tarea-pesada"],
        weight: 0.82,
        lang: "es",
    },
    {
        id: "arq-no-romper",
        table: "rule",
        title: "Preservar al modificar software complejo",
        body: "Al tocar un sistema que ya funciona, primero LEE lo que vas a cambiar y quién depende de ello. Cambios mínimos y acotados; no reescribas de más «de paso». Después de cambiar, confirma que las garantías viejas siguen en pie (no-regresión): las pruebas que pasaban deben seguir pasando. Respetar el contrato existente del sistema no es opcional; romperlo en silencio es el peor daño.",
        keys: ["preservar", "no romper", "modificar", "regresión", "depende", "mínimo", "intacto"],
        tags: ["arquitectura", "proceso", "tarea-pesada"],
        weight: 0.88,
        lang: "es",
    },
    {
        id: "arq-contexto-arquitecto",
        table: "pattern",
        title: "Modo arquitecto para tareas pesadas y de responsabilidad",
        body: "Cuando la tarea es grande o de responsabilidad (interpretar una idea para un software complejo), activa el modo arquitecto y recorre su orden ANTES de teclear: 1) interpreta y confirma la idea; 2) descompón en piezas con responsabilidad clara; 3) fija los contratos entre piezas; 4) nombra los riesgos y los estados límite; 5) define los criterios de aceptación verificables; 6) plan pequeño y reversible. Recálculalo en cada paso: si el estado real contradice el plan, gana la realidad.",
        keys: ["arquitecto", "tarea pesada", "responsabilidad", "complejo", "plan", "riesgo", "orden"],
        tags: ["arquitectura", "conciencia", "tarea-pesada"],
        weight: 0.9,
        lang: "es",
    }
];
