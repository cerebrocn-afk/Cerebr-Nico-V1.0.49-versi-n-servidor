# CerebróNico v1.0.55 — repositorio de servidor

Esta entrega parte del fuente v1.0.49 modificado por Gemini. Es independiente de la edición PC validada por Mario. No hace falta borrar ni reemplazar el repositorio de PC: puedes crear otro repositorio para servidor y conservar ambos.

## Qué subir

Une las partes del ZIP, verifica su MD5 y descomprímelo en una carpeta nueva. Sube el CONTENIDO de `cerebronico-ide-v1.0.55-servidor`, no el ZIP ni sus partes. Mantén los archivos ocultos `.gitignore`, `.gitattributes` y `.dockerignore`.

No subas `.env`, claves, tokens, archivos de sesión, `node_modules`, carpetas de proyectos o registros de validación. El paquete fuente excluye esos datos. Las plantillas `.env.example` y `.env.servidor.example` sí pueden versionarse porque no contienen claves reales.

La carpeta `dist` incluida permite abrir la compilación entregada, pero `.gitignore` no la publica: el alojamiento debe reconstruirla. El SDK vendor sí incluye sus archivos compilados, que requiere el backend.

## Instalación y validación en una carpeta nueva

Usa Node 22. La instalación sin scripts evita descargar Electron para el servidor; los metadatos de escritorio se conservan para no romper los contratos existentes, pero no se entrega ni se construye un EXE.

```text
npm ci --ignore-scripts
npm run validar
npm run validar:server
npm run build
```

## Configurar el servidor

Copia `.env.servidor.example` a `.env` únicamente en tu máquina o configura sus variables en el alojamiento. Nunca lo subas a GitHub.

- `CN_SERVER_MODE=1`: activa las protecciones y el workspace único.
- `ACCESS_TOKEN`: secreto aleatorio propio de al menos 24 caracteres; autentica la IDE, no al proveedor del modelo.
- `CN_PUBLIC_ORIGIN`: origen HTTPS exacto de tu IDE, sin barra final. No copies el ejemplo como si fuera tu dominio.
- `PROJECT_DIR`: carpeta de trabajo de un volumen persistente, separada de la instalación de la IDE. Una configuración inválida detiene el servidor: no hay respaldo silencioso en una carpeta temporal.
- `HOST` y `PORT`: valores exigidos por el alojamiento. En Cloud Run, escucha en `0.0.0.0` y en el puerto asignado al contenedor. En tu máquina puede quedar `127.0.0.1`.
- Claves de proveedores: configúralas de forma privada en el alojamiento o en la interfaz. Ollama no es obligatorio: puedes mantener Gemini u otro proveedor. Su campo de API key es una mejora adicional, no cambia tu plan contratado.

## Ajuste de publicación sin cambio de versión — v1.0.55

`npm start` y `npm run start:server` pasan ahora por el mismo arranque protegido. No uses `node dist/server.mjs` ni `npm run dev` como comando de publicación: omiten la comprobación previa.

Antes de arrancar, `npm run verificar:publicacion` valida configuración, escritura en el workspace y presencia de backend compilado SIN abrir puertos. `npm run probar:publicacion` prueba el comprobador con valores ficticios, sin servidor ni claves reales.

Cloud Run se identifica por K_SERVICE o CN_DEPLOY_TARGET=cloudrun. Si HOST quedó en loopback se corrige a 0.0.0.0; PORT conserva el asignado por el alojamiento. En otros sandboxes configura HOST=0.0.0.0 sólo para que el alojamiento alcance el contenedor; no expongas servicios auxiliares.

PROJECT_DIR es obligatorio y debe estar separado del código: ./workspace sirve para prueba en sandbox, pero no demuestra persistencia. CN_PROJECT_DIR=. no lo sustituye. El dominio de ejemplo es rechazado: configura CN_PUBLIC_ORIGIN con el origen HTTPS REAL de la IDE (sin ruta ni barra final). ACCESS_TOKEN debe ser un secreto privado propio de al menos 24 caracteres. CN_COOKIE_SECURE=1 se conserva; no se elimina autenticación.

El diagnóstico reúne los errores de configuración antes de importar el backend. No genera claves, no adivina el dominio, no monta un volumen y no arregla permisos IAM/Cloud Logging.

Arranque protegido:

```text
npm run start:server
```

Si el alojamiento utiliza `npm run dev` o arranca directamente `dist/server.mjs`, configura también `CN_SERVER_MODE=1` y todas las variables anteriores. El Dockerfile incluido inicia la edición servidor mediante el arranque protegido. Su construcción y despliegue remoto no se han ejecutado aquí.

## Persistencia y seguridad en Cloud Run

La carpeta `/datos/proyecto` creada por la imagen NO es persistente por sí sola. Monta un volumen durable compatible con las operaciones de archivos y renombrado antes de confiarle proyectos. Mantén una sola instancia: esta edición no coordina sesiones entre múltiples instancias ni aísla procesos entre usuarios.

Úsala sólo para una persona de confianza, en un contenedor sin privilegios. La autenticación no transforma el ejecutor de comandos existente en un sandbox de procesos seguro para usuarios públicos.

## Tu veredicto en el alojamiento

1. Entra en la IDE con la clave de acceso.
2. Selecciona el proveedor y un modelo real.
3. Pide crear, releer y editar archivos en `/workspace` mediante las herramientas del modelo.
4. Comprueba que el editor muestra el contenido escrito realmente en disco.
5. Guarda una edición manual, arranca el proyecto y comprueba sus recursos en el preview HTTPS.
6. Recarga la página y reinicia el servicio: deben mantenerse el proyecto y el hilo del chat.
7. Desde otro navegador sin login, comprueba que la API rechaza el acceso.

Una suite local verde no confirma estos pasos. Comparte el registro completo y tu veredicto; no se declara confirmado el despliegue público antes de esa prueba.
