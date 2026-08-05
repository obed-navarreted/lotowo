# HTTPS local para Lotowo

Web Push y la instalación PWA requieren un origen seguro. `localhost` es una excepción únicamente
en la misma computadora; un teléfono que abre `http://192.168.100.12:4200` no está en un contexto
seguro.

1. Ejecuta `npm run cert:local` una sola vez.
2. Instala `.certs/lotowo-local-ca.crt` como autoridad certificadora confiable en la laptop y el
   teléfono. En iOS, después de instalar el perfil, habilita la confianza total de la autoridad en
   **Ajustes → General → Información → Ajustes de confianza de certificados**.
3. Ejecuta `npm run start:https`.
4. Abre `https://192.168.100.12:4200` o `https://192.168.100.18:4200`.

En Android y navegadores Chromium, Lotowo mostrará su botón **Instalar** cuando el navegador
confirme que el manifiesto y el service worker están listos. En iPhone, Safari no ofrece ese
diálogo programáticamente: utiliza **Compartir → Agregar a pantalla de inicio**; Lotowo muestra
esta indicación dentro de la aplicación.

El comando habitual `npm start` sirve la versión HTTP de desarrollo y deliberadamente no registra
el service worker. Esa dirección permite desarrollar, pero no instalar la PWA desde otro
dispositivo.

La clave privada de la autoridad local permanece dentro de `.certs/` y no debe compartirse ni
copiarse a otro servidor. Para una instalación permanente se debe utilizar un dominio y un
certificado público administrado por el proxy HTTPS.
