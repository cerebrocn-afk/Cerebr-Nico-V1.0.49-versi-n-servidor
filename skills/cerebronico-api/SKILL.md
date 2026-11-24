---
name: cerebronico-api
description: Diseñar y consumir APIs REST/HTTP — contrato, validación de entrada, errores honestos y seguridad por defecto. Leer antes de crear un endpoint o integrar un servicio externo.
user_invocable: true
---

# APIs REST (contrato primero, seguridad por defecto)

Una API es un contrato. Se diseña el contrato antes que la implementación, se
valida toda entrada como no confiable, y ningún endpoint expuesto nace sin decir
si tiene o no autenticación.

## Crear un endpoint

1. **Contrato**: método, ruta, forma del cuerpo, forma de la respuesta y los
   códigos de estado (2xx/4xx/5xx). En este repo, refléjalo en
   `contrato-rutas.json` y comprueba con `npm run superficie:verificar`.
2. **Validar la entrada**: todo lo que llega del cliente es dato no confiable.
   Valida tipo, rango y tamaño antes de usarlo. Rechaza con 400 y mensaje claro.
3. **Consultas parametrizadas**: nunca concatenes entrada del usuario en SQL,
   shell ni rutas de archivo. Parámetros ligados, siempre.
4. **Errores honestos**: 4xx para culpa del cliente, 5xx para culpa del servidor.
   No devuelvas 200 con un cuerpo de error. No filtres stack traces al cliente.
5. **Seguridad por defecto**: si el endpoint queda sin autenticación ni control
   de acceso, **díselo al usuario explícitamente** aunque no lo haya preguntado.
   Escuchar solo en `127.0.0.1` salvo que se pida lo contrario.

## Consumir una API externa

- **Timeout y reintentos**: toda llamada de red puede colgarse. Pon timeout y
  reintento con backoff; un fallo de red se reporta, no se traga.
- **No confiar en la respuesta**: valida el JSON recibido contra la forma
  esperada antes de usarlo. Un 200 no garantiza el cuerpo correcto.
- **Secretos fuera del código**: claves y tokens van en `.env` (mira
  `.env.example`), nunca hardcodeados ni en logs ni en el repo.
- **Límites de tasa**: respeta el rate-limit del proveedor; ante 429, espera.

## Honestidad

No afirmes que una integración "funciona" sin una llamada real que devuelva lo
esperado. Sin credencial válida o sin red, se dice que no se pudo probar.
