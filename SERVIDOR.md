# CerebróNico 1.0.55 — edición servidor experimental

Autor del proyecto: Mario Nicolás Quintero, Montevideo, Uruguay.

## Qué cambia

- La obra del modelo, el árbol y el editor comparten una única raíz de disco. `/workspace/index.html` y `index.html` significan el mismo archivo. No se desvía la primera escritura a una carpeta oculta con el título del chat.
- El editor consulta un inventario limitado del servidor cada 2 segundos, conserva ediciones locales marcadas como pendientes y abre el primer archivo. Las modificaciones manuales siguen el mecanismo de sincronización existente.
- La sección Ollama permite endpoint local o `https://ollama.com`, API key y detección de modelos. La clave de interfaz vive en memoria: debe volver a introducirse al recargar. Alternativamente el administrador puede definir OLLAMA_API_KEY. La clave acompaña catálogo, prechequeo, streaming y bucle de herramientas desde el backend. No se añade a URLs ni al JSON de sesión.
- La sesión actual se guarda en `.sesiones/actual.json` bajo la raíz de datos: mensajes, modelo, proveedor y fecha. Se restaura antes del autoguardado del navegador. Es memoria sencilla del hilo, NO un motor nuevo de planificación autónoma. No se eliminan los motores heredados; sus puertos pueden seguir apagados.
- El preview se publica bajo `/sandbox-preview/` mediante un destino interno fijo de lectura, sin abrir el 3500 a Internet. Los recursos absolutos habituales de HTML/CSS y módulos se adaptan al prefijo. La vista usa un ticket limitado al preview y un iframe de origen aislado; ese ticket nunca autoriza la API.
- Todas las rutas `/api` requieren autenticación en modo servidor, incluso detrás de un proxy que conecta por loopback. El login usa una cookie HttpOnly/Secure. Las peticiones de un iframe de origen opaco o de otro origen son rechazadas.
- El escritorio no entra en modo servidor salvo que se configure explícitamente. Ésta es una entrega distinta de la edición Windows validada por el usuario.

## Requisitos del alojamiento

No basta un hosting estático. Debe poder ejecutar Node 22, mantener procesos durante la sesión, escribir en un volumen persistente, instalar dependencias de proyectos y publicar el backend por HTTPS. Python sólo es necesario para los servicios heredados que se quieran mantener; los archivos y sesiones nuevos no dependen del puente Python.

El proceso debe ejecutarse como usuario sin privilegios, en un contenedor o máquina dedicados a una sola persona de confianza. El ejecutor de comandos existente sigue pudiendo ejecutar comandos del proyecto con los permisos de ese usuario: este parche NO implementa aislamiento de procesos por proyecto, quotas de ejecución ni multiusuario. No publicar esta edición como un servicio abierto o compartido.

## Configuración

Copiar `.env.servidor.example` a `.env` y completar:

- ACCESS_TOKEN: secreto aleatorio propio de al menos 24 caracteres. Es la clave para entrar en la IDE, no la clave de Ollama.
- CN_PUBLIC_ORIGIN: origen público exacto, por ejemplo `https://cerebronico-v1-0-49.ai.studio`, sin barra final.
- PROJECT_DIR: raíz real persistente de trabajo. En un contenedor con la app instalada aparte, puede ser `/workspace`. Si ai.studio instala la IDE en `/workspace`, NO usar esa misma carpeta para los proyectos: elegir `/workspace/proyecto` y mantener el código de la IDE separado. La interfaz sigue llamando `/workspace` a su raíz de trabajo lógica.
- OLLAMA_URL: `https://ollama.com` para nube o URL de Ollama accesible desde el backend. No agregar `/api` al final.
- OLLAMA_API_KEY: opcional, clave del administrador. También se puede introducir en la interfaz. No subir el archivo `.env` a un repositorio público.
- HOST/PORT: interfaz y puerto que solicite el alojamiento. En un VPS con proxy local puede quedar HOST=127.0.0.1; en Cloud Run el arranque corrige loopback a 0.0.0.0; si el proveedor exige escuchar la interfaz del contenedor, configurar HOST=0.0.0.0. Los servicios auxiliares no se publican.

Usar HTTPS real, preservar cookies y permitir respuestas de streaming sin buffering en el proxy de la IDE. No agregar CORS abierto a la API. El backend y la interfaz deben publicarse en la raíz del mismo origen. El parche no promete soporte para publicar la IDE completa bajo un subdirectorio arbitrario.

## Instalar / arrancar

```text
npm ci --ignore-scripts
npm run validar:server
npm run build
npm run start:server
```

`--ignore-scripts` evita descargar Electron para una edición de servidor. El fuente incluye el SDK precompilado y el cliente/backend en `dist`, además de poder reconstruirlos. Esta entrega corrige un hash de tapable del lockfile que no coincidía con el registro; no desactiva la verificación de integridad.

También se puede ejecutar `npm run validar` para la suite completa heredada. Fue ejecutada íntegramente en esta entrega: 344 suites y 12844 comprobaciones, 0 fallos. Consultar `VALIDACION-SERVIDOR.md` para evidencia y límites.

## Prueba en tu dominio

1. Abrir la IDE, ingresar la clave de acceso del servidor.
2. Configurar Ollama Cloud, introducir API key y pulsar Detectar modelos. Elegir un modelo real del catálogo y el motor Ollama.
3. Pedir: «Crea index.html, styles.css y script.js en /workspace usando herramientas de archivos. Relee los tres archivos. Muéstralos en el editor y arranca la vista previa.»
4. Confirmar que el árbol muestra archivos reales y que abrirlos coincide con el contenido servido. El modelo no puede ejecutar pc_* en esta modalidad.
5. Pulsar Arrancar ahora. Comprobar documento, CSS, imágenes y comportamiento del proyecto en el preview HTTPS.
6. Recargar la página: el hilo debe volver del servidor y los archivos del disco. La API key introducida en la interfaz debe volver a cargarse; no es un fallo de persistencia.
7. Reiniciar el servicio: confirmar que el volumen persistente conserva archivos y sesión.
8. Acceder sin login desde otro navegador: las rutas de API deben devolver 401.

## Límites y pendientes reales

- No se ha desplegado ni probado en vivo el dominio del usuario. Sigue pendiente confirmar lo que permite ai.studio y sus permisos.
- La vista previa conserva los mecanismos de compilación/arranque originales. El proxy nuevo ofrece lectura, no una vía WebSocket/HMR nueva. Los cambios visibles se recargan cuando cambia el inventario. Proyectos que requieren WebSocket de aplicación, autenticación propia, SSR/redirecciones complejas o rutas dinámicas construidas desde JavaScript pueden necesitar configuración adicional.
- El inventario del editor incluye archivos de texto habituales, hasta 1500 archivos, 2 MiB por archivo y 16 MiB por consulta. Los binarios permanecen en disco y se sirven como recursos. No es sincronización de archivos ilimitados.
- Un ticket de preview permite a quien lo tenga leer la vista previa de esa instalación hasta rotar ACCESS_TOKEN. No autoriza herramientas ni API. No compartirlo si el proyecto es privado.
- No se sustituyeron memoria semántica, planificación, sandbox de ejecución y Ollama por una carpeta, ni se pintaron puertos ausentes de verde. El guardado de sesión aporta persistencia del hilo, no esas capacidades adicionales.
- Confirmación visual de interfaz, ejecución de un proyecto mediante el modelo y continuidad tras reiniciar: pendientes del veredicto del usuario.

## Integración del fuente de Gemini — v1.0.55

Esta edición parte del ZIP actualizado por Gemini, no sustituye ese fuente por la adaptación previa. Conserva los daemons Python, el PATH/NODE_PATH de proyectos, la resolución de instalación y las pausas de sondeo cuando la pestaña está oculta. El permiso por mismo origen se elimina: no autentica a una persona.

PROJECT_DIR es obligatorio en servidor y una ruta inválida detiene el arranque, sin cambiar a /tmp. La raíz explícita se selecciona antes de sondear raíces de escritorio. El proxy seguro sustituye al proxy de Gemini sólo en modo servidor para no reenviar cookies a la obra. `/healthz` sólo informa disponibilidad del backend: no acredita modelo, sandbox ni volumen persistente.

Dockerfile es una receta pendiente de construir/probar, no un despliegue confirmado. Cloud Run debe montar un volumen durable en /datos y suministrar ACCESS_TOKEN y CN_PUBLIC_ORIGIN como configuración privada. Su sistema de archivos predeterminado es efímero: crear /datos en la imagen NO aporta persistencia. Esta edición es para un único usuario de confianza; ejecución arbitraria de proyectos y escalado multiinstancia siguen sin aislamiento/coordinarse. Mantener una sola instancia, y usar almacenamiento compatible con escritura y renombrado de archivos; comprobar reinicio antes de confiarle proyectos.

La clave de Ollama es una opción independiente del arreglo. El modelo puede ser Gemini u otro proveedor; se conserva su motor de herramientas. La prueba pública modelo→archivo→editor→guardar→preview todavía debe hacerse en el alojamiento real.

## Parche de publicación, misma v1.0.55

Consultar SUBIR-A-GITHUB.md: npm start pasa por arranque protegido; precheck sin abrir puertos con npm run verificar:publicacion. El origen de ejemplo y PROJECT_DIR=. se rechazan con diagnóstico antes de importar el backend. La plantilla ya no trae un dominio ficticio, mantiene autenticación obligatoria y ofrece HOST=0.0.0.0 para el contenedor del sandbox. No configura ni confirma el alojamiento.
