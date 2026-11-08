# Despliegue de GameZone

Revisión: **2 de noviembre de 2026**. Web pública: **https://gamezone-impaul17.netlify.app**. Netlify Free sirve la aplicación Next.js, sus API y sesiones; Supabase conserva el catálogo, noticias, identidades y fotos privadas. No se ha contratado un dominio propio ni se ha activado una recarga automática.

## Repositorio y publicación

El sitio `gamezone-impaul17` utiliza `ImPaul17/GameZone`, rama `feat/react-editorial-foundation`. La conexión emplea una clave de despliegue de solo lectura. Las comprobaciones de GitHub ejecutan lint, TypeScript, pruebas, build y recorridos de navegador. Solo después de completarse correctamente, un push de esa rama solicita el despliegue mediante un build hook limitado al sitio; su URL permanece en un secreto cifrado del repositorio.

El workflow comprueba que el commit revisado sigue siendo la punta de la rama. `scripts/verify-netlify-commit.mjs` compara además el payload del hook con `COMMIT_REF` antes de compilar, y cancela una publicación que hubiera clonado otra revisión. Los builds manuales de Netlify no requieren payload. La aceptación del hook significa que se ha solicitado un build; el resultado final debe comprobarse en Netlify. [Build hooks](https://docs.netlify.com/build/configure-builds/build-hooks/).

`netlify.toml` registra explícitamente `@netlify/plugin-nextjs` sin fijar su versión. Se ha comprobado el empaquetado con **OpenNext 5.16.5**, **Next.js 16.4.3**, Turbopack y funciones Node 22, incluyendo Proxy. No se necesita exportación estática ni un rewrite global a `index.html`. [Adaptador oficial](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

| Ajuste | Configuración |
| --- | --- |
| Build | `node scripts/verify-netlify-commit.mjs && npm run build` |
| Publicación | `.next`, empaquetado por el adaptador |
| Node del build | Rama 22 compatible con `>=22.14.0` |
| Funciones | `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` |
| Persistencia | Supabase; `GAMEZONE_LOCAL_MODE=0` |
| Origen | `NEXT_PUBLIC_SITE_URL=https://gamezone-impaul17.netlify.app` |
| Discord | Activado; acceso real confirmado por el propietario en esta URL |
| Visibilidad | Producción pública; Deploy Previews privados |

Las variables de Supabase y la credencial del servidor están guardadas en el entorno privado de Netlify, fuera de Git. El plan Free utiliza los ámbitos predeterminados: restringirlos por API devolvía 403. La credencial del servidor se consume exclusivamente en módulos de servidor y nunca se añade a los paquetes del navegador. Cambiar variables exige un nuevo despliegue. [Variables y funciones](https://docs.netlify.com/build/functions/configuration/).

## Supabase y autenticación

Proyecto GameZone, región París, plan Free. La Site URL es el origen público y se conservan las dos URLs locales de desarrollo. Retornos de producción permitidos:

- `https://gamezone-impaul17.netlify.app/api/admin/session/callback`
- `https://gamezone-impaul17.netlify.app/api/account/discord/callback`

El callback del portal de Discord continúa apuntando a Supabase: `https://gcykxpjuuujtpkoftmwl.supabase.co/auth/v1/callback`. El propietario introdujo la credencial directamente en Supabase y confirmó que el recorrido público termina en su perfil. El registro Discord no concede permisos editoriales.

Las migraciones del catálogo, snapshots, noticias y perfiles están aplicadas. También está aplicada `20261030170818_restrict_rls_auto_enable_execute.sql`, que retira la ejecución pública del helper del trigger de RLS sin desactivar dicho trigger. El catálogo conserva nueve juegos y no se han publicado noticias sintéticas en la base real.

El correo editorial del propietario funciona con el proveedor predeterminado. **El envío de acceso por correo a destinatarios externos requiere configurar SMTP propio**; las cuentas públicas usan Discord. No se ha contratado un proveedor de correo.

## Plantillas originales y recursos

Next.js debe incluir las 17 páginas HTML originales en el servidor de Netlify. El patrón de tracing `/api/site/*` incluye todas ellas; el patrón anterior con corchetes del catch-all dejaba vacío su manifiesto de archivos con Turbopack y provocaba 503 en catálogo, búsqueda y páginas informativas. La comprobación del manifiesto forma parte de la validación de este arreglo.

Los archivos de `public/` se sirven como recursos. `.env*`, `.data/`, copias privadas y el ZIP histórico quedan excluidos del tracing. Las páginas y fichas conservan sus rutas `.html` y el aspecto original. SQLite es únicamente almacenamiento local; no es persistencia ni sustituto ante errores de Supabase en producción.

Las fotos se normalizan con Sharp a WebP de 256 × 256 sin metadatos y se almacenan en el bucket privado `profile-avatars`. El máximo del archivo es 4 MiB, el cuerpo multipart admite 4 MiB + 64 KiB y se limita la imagen de entrada a 20 megapíxeles. Estos límites contemplan la codificación de payload binario en Netlify. [Sharp en Lambda](https://sharp.pixelplumbing.com/install/#aws-lambda), [límites de funciones](https://docs.netlify.com/build/functions/configuration/).

## Dirección anterior y reversión

La dirección anterior es `https://impaul17.github.io/GameZone/`, destino del enlace corto `https://bit.ly/gamezonesite`. `scripts/build-pages-bridge.mjs` genera únicamente páginas de transición dentro de `.data/pages-bridge`, sin modificar los HTML originales. El destino está limitado al origen de producción. El puente elimina solo `/GameZone` y conserva la ruta, consulta y fragmento; incluye enlace de continuación y una página 404 para rutas nuevas. GitHub Pages no aporta redirecciones HTTP administradas para este caso.

La publicación inicial del puente utiliza la rama de artefactos `codex/pages-bridge`, con 20 páginas, la fuente SNES y `.nojekyll`; la fuente de Pages apunta a esa rama y `/`. `main` conserva la web estática anterior. El workflow opcional `pages-bridge.yml` es manual y debe incorporarse a la rama predeterminada antes de utilizar su botón de ejecución; no intervino en esta primera publicación. Subir código editorial no cambia por sí mismo el puente.

Para volver temporalmente a la web estática anterior, restaurar la fuente de Pages a `main` y `/` y solicitar un build de Pages. Para revertir la aplicación, restaurar un despliegue anterior compatible en Netlify; no borrar ni reinicializar Supabase o SQLite.

## Verificación

231 pruebas de código, lint, TypeScript, build y 18 recorridos de navegador correctos. La [ejecución de GitHub](https://github.com/ImPaul17/GameZone/actions/runs/41383963098) del commit `98c56f2a73322ace954c90eb8ea774d43d91cc8e` solicitó automáticamente el despliegue `6ae805ddcc17eaddb8ccdcd5`, publicado correctamente. Los logs confirman que la guardia recibió y verificó ese mismo SHA.

En HTTPS responden correctamente las 17 páginas originales, la raíz, el panel, la cuenta y los 21 recursos locales referenciados comprobados. El catálogo mantiene nueve juegos. Las API privadas devuelven 401 sin sesión y encabezados de caché privada; las mutaciones con un origen ajeno devuelven 403. Discord usa cookies Secure/HttpOnly y PKCE. El propietario confirmó su perfil en producción.

El cambio de foto se prueba con imágenes reales y transporte simulado; la subida, lectura y retirada de una imagen sintética también se comprobó directamente en el bucket real. No se ha sustituido la foto personal del propietario para realizar pruebas.

Los estados finales del despliegue, el puente y las verificaciones remotas se registran en [Estado de implementación](ESTADO_IMPLEMENTACION.md). Quedan como ampliaciones independientes el dominio propio, SMTP externo, biblioteca, comentarios, moderación y newsletter.
