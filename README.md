# Lotowo

Aplicación mobile-first para la operación de Lotowo. La PWA y la aplicación Android comparten la misma base Angular 22/TypeScript; Android añade acceso nativo a impresoras térmicas Bluetooth Classic sin abrir el diálogo de impresión ni depender de aplicaciones de terceros.

## Desarrollo $$$

Requisitos: Node.js `22.22.3+` y la API de Lotowo ejecutándose en `http://localhost:8080`.

```bash
npm install
npm start
```

Abra `http://localhost:4200`. El servidor de desarrollo escucha en todas las interfaces de red y el proxy dirige `/api` al backend, por lo que no es necesario habilitar CORS para desarrollo local.

Para probar desde un teléfono conectado a la misma red Wi-Fi, abra la IP local de la laptop con el puerto `4200`. Por ejemplo:

```text
http://192.168.100.18:4200
```

La dirección puede consultarse con `hostname -I`. Use la IP de la interfaz Wi-Fi y no una dirección de Docker. Después de cambiar de red, la IP puede cambiar.

## Comandos

```bash
npm run build
npm test -- --watch=false
```

La compilación de producción queda en `dist/lotowo`. El bundle inicial está dividido de las páginas de login, dashboard, ventas, boletos y reportes mediante lazy loading.

## Aplicación Android e impresora térmica

Requisitos de compilación: Android Studio/SDK 36 y JDK 21. El backend continúa usando Java 25; el JDK 21 sólo es para Gradle/Android.

```bash
npm run android:sync
npm run android:open
npm run android:apk
```

En esta máquina el SDK de línea de comandos está instalado de forma aislada en `/data/tools/android-sdk`. No se añadió a los perfiles de la terminal, no tiene servicios de inicio y el script `android:apk` ejecuta Gradle con `--no-daemon`; sólo se carga cuando se invoca un comando Android.

Desde Android Studio puede instalarse la variante `debug` en el teléfono o generar el APK firmado de producción. La aplicación solicita los permisos Bluetooth correspondientes a la versión de Android y permite buscar, vincular y probar la impresora desde **Mi dispositivo → Impresora de recibos**.

Comportamiento de impresión:

- papel térmico comercial de 58 mm y recibo ESC/POS de 32 columnas;
- impresión automática al completar una venta, configurable por usuario y por teléfono;
- reconexión silenciosa cada tres segundos mientras Lotowo está abierta o vuelve al primer plano;
- cola persistente en IndexedDB: un recibo pendiente sobrevive a recargas o cierres y se envía al recuperar la conexión;
- indicador discreto verde/rojo en la barra superior y contador de recibos pendientes;
- la primera salida queda como impresión original y las posteriores como reimpresiones mediante el mismo endpoint auditado del backend;
- en navegador/PWA se conserva el PDF como respaldo; la impresión directa Bluetooth Classic se ejecuta en la aplicación Android.

La integración usa el perfil Bluetooth Classic SPP, habitual en impresoras térmicas económicas de 58 mm. El emparejamiento inicial puede mostrar la solicitud de PIN de Android (normalmente `0000` o `1234`, según el fabricante); después Lotowo conserva el dispositivo y se reconecta sola.

### Notificaciones push en Android

La APK usa Firebase Cloud Messaging (FCM) de forma nativa. El centro de notificaciones dentro de Lotowo sigue funcionando sin Firebase; estos pasos sólo son necesarios para recibir avisos con la aplicación cerrada:

1. Cree un proyecto en Firebase y registre una aplicación Android con el paquete `ni.lotowo.app`.
2. Descargue `google-services.json` y colóquelo en `android/app/google-services.json`. El archivo está ignorado por Git.
3. En el backend habilite `LOTO_FCM_ENABLED=true`, defina `LOTO_FCM_PROJECT_ID` y configure `GOOGLE_APPLICATION_CREDENTIALS` con la ruta absoluta de una cuenta de servicio autorizada para Firebase Cloud Messaging.
4. Ejecute `npm run android:sync` y vuelva a generar/instalar el APK.

La aplicación crea el canal Android **Alertas de Lotowo**, solicita el permiso de notificaciones en Android 13 o superior, registra el token contra la sesión vigente y abre la pantalla correspondiente cuando el usuario toca el aviso. Las credenciales privadas de la cuenta de servicio pertenecen únicamente al backend: nunca deben copiarse al frontend ni al APK.

Durante el desarrollo, la aplicación Android apunta a `http://192.168.100.12:8080` en `src/app/core/api/native-api-origin.interceptor.ts`. Antes de publicar debe reemplazarse por el dominio HTTPS definitivo de la API y deshabilitarse el tráfico HTTP claro (`allowMixedContent` y `usesCleartextTraffic`).

## Funcionalidad inicial

- autenticación real con token opaco guardado en `sessionStorage`;
- elección para trasladar la sesión al dispositivo actual cuando el usuario alcanza su límite;
- interceptor bearer, cierre de sesión y redirección automática ante `401`;
- shell responsive con sidebar para laptop y navegación inferior para móvil;
- navegación visible según rol;
- dashboard conectado a sorteos, resultados y disponibilidad del vendedor;
- control administrativo para bloquear o rehabilitar ventas de un sorteo abierto específico;
- venta táctil de números `00`–`99`, montos por número e idempotencia;
- historial paginado de boletos;
- analítica inicial calculada con datos reales accesibles al usuario;
- exposición por terminación para cada sorteo, global o filtrada por ruta y vendedor según el rol;
- alertas administrativas configurables cuando el premio potencial de un número supera el monto definido;
- administración de usuarios por rol, asignación de rutas y tablas, límites, comisión y sesiones;
- creación rápida de rutas durante el alta de un vendedor;
- creación y edición visual de tablas de premios genéricas por cantidades exactas (`monto jugado → premio`);
- asignación independiente de tabla diaria y tabla de Lotería Nacional para cada vendedor, usando el catálogo completo en ambas;
- creación manual de sorteos de Lotería Nacional con consecutivo histórico protegido;
- fechas de Lotería Nacional capturadas y mostradas como `DD/MM/AAAA`, siempre en hora de Nicaragua;
- venta limitada visualmente a los tres próximos sorteos diarios y el próximo sorteo nacional abierto;
- administración paginada de rutas con creación, edición, desactivación lógica y restauración;
- errores procedentes del backend mostrados en español.

Los reportes definitivos por período y exportaciones dependerán de los endpoints de reportería que se incorporen posteriormente al backend.
