# Despliegue de GameZone

Estado: **proyecto Netlify creado; primer despliegue público pendiente de validar**. Fecha de revisión: 30 de octubre de 2026. El propietario autorizó Netlify y se creó `gamezone-impaul17`, con URL `https://gamezone-impaul17.netlify.app`, en su cuenta Free sin recarga automática. Las variables de Supabase y el origen están configurados de forma privada. La existencia del proyecto no confirma todavía que haya una versión publicada y comprobada.

La web anterior responde en `https://impaul17.github.io/GameZone/`. El enlace `https://bit.ly/gamezonesite` apunta a ella. GitHub Pages sirve contenido estático; la versión con sesiones, API y publicación editorial necesita el servidor de Next.js. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [opciones de despliegue de Next.js](https://nextjs.org/docs/app/getting-started/deploying).

## Configuración mínima propuesta en Netlify

Conectar el repositorio de GitHub y seleccionar la rama de lanzamiento revisada. Usar la raíz del repositorio como directorio base, detectar Next.js y ejecutar `npm run build`; el directorio de publicación de Next es `.next`. Dejar que Netlify instale su adaptador OpenNext automáticamente. No añadir una exportación estática ni un rewrite global a `index.html`: impedirían servir las sesiones y API correctamente. [Adaptador oficial](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [precaución con rewrites globales](https://www.netlify.com/knowledge-base/how-to-deploy-nextjs-astro-nuxt-or-sveltekit-to-netlify/).

| Ajuste | Valor propuesto |
| --- | --- |
| Node del build | Rama 22 actual, que cumpla `>=22.14.0`. |
| Funciones Node | `AWS_LAMBDA_JS_RUNTIME=nodejs22.x`. |
| Almacenamiento | Supabase configurado; `GAMEZONE_LOCAL_MODE=0`. |
| Origen de la aplicación | `NEXT_PUBLIC_SITE_URL=https://<sitio>.netlify.app` o el dominio HTTPS definitivo. |
| Acceso Discord | Mantener desactivado hasta configurar y comprobar su callback en ese origen. |

`AWS_LAMBDA_JS_RUNTIME` debe establecerse mediante la interfaz, CLI o API de Netlify, no desde `netlify.toml`. Las variables utilizadas en ejecución deben estar disponibles para **Functions**, y para **Builds** cuando intervengan en la compilación. En esta cuenta Free, restringir los ámbitos por API devuelve 403: se utilizan los ámbitos predeterminados del plan. La credencial de Supabase sigue siendo una variable privada del alojamiento y los módulos que la consumen son exclusivamente de servidor; no se añade al código ni a los paquetes del navegador. Cambiar variables requiere un nuevo despliegue. [Runtime de funciones](https://docs.netlify.com/build/functions/configuration/), [variables para Edge Functions de Next.js](https://docs.netlify.com/build/edge-functions/environment-variables/).

Netlify genera las funciones del servidor mediante el adaptador; no necesita ejecutar nuestro `npm start` local, que escucha en loopback. La elección del plan y sus límites de uso se comprueban en la cuenta antes de publicar; esta preparación no activa servicios de pago.

## Compatibilidad que debe comprobar el primer despliegue

El adaptador ejecuta SSR y Route Handlers en funciones Node y el middleware de Next mediante Edge Functions. Su compatibilidad con Node Middleware excluye sistema de archivos y complementos C++. El `proxy.ts` de GameZone solo importa el módulo de sesión basado en Supabase/HTTP; su importación de los tipos de autorización se elimina al compilar. Debe mantenerse separado de los repositorios SQLite y del procesamiento de imágenes. [Soporte y limitaciones de Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Los repositorios de catálogo y noticias importan `node:sqlite` al cargar el módulo, aunque la producción utilice Supabase. Por eso hay que fijar un runtime Node compatible, no confiar en que la selección de almacenamiento evite el import. Node 22.13 eliminó la necesidad del flag experimental para SQLite; el proyecto requiere como mínimo 22.14. No se utilizará un archivo SQLite como almacenamiento persistente de Netlify ni como sustituto ante un fallo remoto. [SQLite en Node 22](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

Sharp debe instalarse y empaquetarse con los binarios Linux de la arquitectura de las funciones. Mantener sus dependencias opcionales y comprobar una subida real de avatar; un `node_modules` copiado de Windows no sirve como paquete de producción. El procesamiento de fotos permanece en una función Node, nunca en `proxy.ts`. [Instalación de Sharp y AWS Lambda](https://sharp.pixelplumbing.com/install/#aws-lambda).

Las funciones con payload binario tienen menos capacidad efectiva que el límite de petición sin codificar debido a Base64. GameZone limita el archivo a **4 MiB** y la solicitud multipart completa a **4 MiB + 64 KiB**, con un único archivo; SQL 004 configura el bucket con el mismo máximo de archivo. Se mantiene la comprobación de 20 megapíxeles y la normalización a WebP de 256 × 256. [Límites de payload de Netlify](https://docs.netlify.com/build/functions/configuration/).

Hay una incidencia abierta del adaptador sobre el empaquetado de `proxy.ts` con Next 16.3.x y Turbopack. No demuestra un fallo de nuestra versión 16.4.3, pero impide dar por validado el despliegue solo porque `next build` pase en local. El primer build del adaptador debe completarse y su sesión debe probarse antes de promover el sitio. No se eliminará Proxy ni se desactivará la autorización para resolver un fallo de empaquetado. [Incidencia #3575 del adaptador](https://github.com/opennextjs/opennextjs-netlify/issues/3575).

`npm run build -- --webpack` es una opción válida de Next.js para comparar ambos compiladores. **No es una solución confirmada para esa incidencia**: el autor también reprodujo el fallo con Webpack, donde faltaba `webpack-runtime.js`. Cualquier elección del compilador sigue requiriendo la comprobación completa del adaptador y un despliegue de prueba. [Opciones de `next build`](https://nextjs.org/docs/app/api-reference/cli/next#next-build-options), [comprobación de Webpack en #3575](https://github.com/opennextjs/opennextjs-netlify/issues/3575#issuecomment-5861735932).

Los HTML originales que lee el renderizador deben formar parte de las funciones. El proyecto ya declara `outputFileTracingIncludes` para las páginas y vistas previas. Verificar en el resultado del adaptador que aparecen los HTML de la raíz y `games/`, junto con los recursos de `public/`; no incluir `.env*`, `.data/`, copias privadas ni el ZIP histórico.

## Orden de publicación

1. Conservar la web de GitHub Pages mientras se valida la nueva URL de Netlify.
2. Ejecutar los controles del repositorio y crear un despliegue de prueba con el adaptador, sin promoción automática inicial.
3. Configurar el origen HTTPS definitivo y los tres valores de Supabase en el entorno privado. Aplicar y comprobar las migraciones; no transferir otra vez un catálogo que ya esté verificado sin revisar antes el dry-run.
4. Añadir a la lista de retornos de Supabase `<origen>/api/admin/session/callback` y `<origen>/api/account/discord/callback`. El callback registrado en Discord sigue siendo `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Comprobar las páginas `.html`, recursos y fuentes; noticias; acceso editorial; aislamiento de un miembro sin rol; renovación y cierre de sesión; subida y lectura privada de una foto. Comprobar los encabezados privados de caché y que el origen recibido por el servidor coincide con la configuración canónica.
6. Activar Discord solo después de completar su configuración y prueba. Promover el despliegue cuando los recorridos anteriores funcionen en la URL HTTPS real.
7. Actualizar la entrada pública al sitio nuevo mediante el enlace corto y/o un puente desde GitHub Pages, conservando la posibilidad de volver a la versión anterior.

El origen de producción no debe añadir `/GameZone` como prefijo: la aplicación actual mantiene sus rutas `.html` en la raíz del dominio nuevo. Para cualquier puente desde Pages, retirar únicamente el prefijo `/GameZone` y conservar el resto de la ruta, consultas y fragmentos. No se da por disponible una redirección HTTP administrada desde GitHub Pages; su transición debe resolverse con las capacidades del alojamiento y el acceso del titular al enlace corto.

La configuración detallada de permisos y datos está en [supabase/README.md](../supabase/README.md) y [Cuentas con Discord](CUENTAS_DISCORD.md). Registrar aquí la URL, el adaptador y el resultado de las pruebas cuando el despliegue real esté terminado.
