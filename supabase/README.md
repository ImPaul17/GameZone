# Catálogo editorial y acceso en Supabase

La web pública conserva los HTML, los estilos y las rutas originales. Supabase sustituye el almacenamiento local y gestiona la identidad del editor. Tener una cuenta de Supabase Auth no concede permisos editoriales por sí solo.

## Preparar el proyecto

1. Crea el proyecto propio y guarda su contraseña de base de datos de forma privada.
2. Aplica las migraciones por orden. Las tablas y RPC editoriales quedan accesibles únicamente al servidor mediante `service_role`; RLS está activado.
3. Copia `.env.supabase.example` a `.env.supabase.local` y completa la URL del proyecto, la clave pública y la clave secreta del servidor. Este archivo está excluido de Git. No actives aún esos valores en `.env.local`: primero transfiere el catálogo.

Las claves nuevas `sb_secret_…` se envían únicamente en `apikey`; las claves antiguas `service_role` también se admiten. La clave secreta nunca debe llevar prefijo `NEXT_PUBLIC_` ni entregarse al navegador. [Claves de Supabase](https://supabase.com/docs/guides/api/api-keys).

| Migración | Qué prepara |
| --- | --- |
| [`202610300001_editorial_catalog.sql`](migrations/202610300001_editorial_catalog.sql) | Catálogo de juegos, roles editoriales y guardado/publicación con control de revisión. |
| [`202610300002_import_catalog_snapshots.sql`](migrations/202610300002_import_catalog_snapshots.sql) | Transferencia exacta de fichas SQLite mediante una RPC transaccional que no sobrescribe datos. |
| [`202610300003_news_editorial.sql`](migrations/202610300003_news_editorial.sql) | Noticias privadas, borradores y snapshots publicados; RPC de creación y actualización reservadas al servidor. |
| [`202610300004_member_profiles.sql`](migrations/202610300004_member_profiles.sql) | Perfiles de miembros, políticas sobre el perfil propio y bucket privado para fotos normalizadas. |

La migración de noticias empieza sin artículos: no inventa publicaciones ni modifica los juegos existentes. Las cuentas de miembros y sus perfiles no conceden roles editoriales. Aplica y comprueba las migraciones del proyecto antes de habilitar las funciones correspondientes en el entorno activo.

## Transferir el catálogo existente

Detén las escrituras editoriales durante la transferencia. Conserva `.data/gamezone.db`: no se borra ni se sustituye al migrar. El script necesita Node.js 22.14 o posterior.

```powershell
node --experimental-strip-types scripts/migrate-to-supabase.mjs --env-file .env.supabase.local
node --experimental-strip-types scripts/migrate-to-supabase.mjs --env-file .env.supabase.local --apply
```

El primer comando es una comprobación sin escrituras. `--apply` guarda una copia privada en `.data/migrations/`, envía una operación transaccional y comprueba después el contenido. Preserva UUID, borrador, versión publicada, revisión, fechas, fuente, referencia de la última importación y reserva del slug. Una repetición con datos idénticos no crea duplicados. Cualquier conflicto bloquea la importación completa: no sobrescribe el catálogo remoto.

Esta herramienta transfiere el catálogo de **juegos**; no transfiere la tabla de noticias ni perfiles. Si ya hay noticias guardadas en SQLite, conserva esa base y prepara su transferencia antes de cambiar el almacenamiento activo. Configurar Supabase cambia la fuente de datos y no fusiona automáticamente las tablas locales con las remotas.

Si la base está en otra ubicación, añade `--database <archivo>`. Una ruta inexistente produce un error: el script no crea ni inicializa una base vacía.

Después de verificar el resultado y preparar el acceso editorial, añade los tres valores de Supabase a la configuración activa del servidor y establece `GAMEZONE_LOCAL_MODE=0`. Reinicia la aplicación y comprueba portada, catálogo, fichas y sesión editorial. Una configuración parcial o un fallo remoto no provocan una sustitución silenciosa por SQLite.

## Preparar el acceso editorial por correo

1. Crea o invita al usuario editor desde **Authentication > Users**. La solicitud de código en GameZone usa `shouldCreateUser: false` y no registra usuarios nuevos.
2. Asigna expresamente su UUID mediante el editor SQL:

```sql
insert into public.editor_roles(user_id, role)
values ('UUID-DEL-USUARIO', 'admin');
```

3. Elige `GAMEZONE_EDITOR_EMAIL_METHOD=link` para usar la plantilla predeterminada. Configura `NEXT_PUBLIC_SITE_URL` con el origen exacto de la aplicación y añade `<origen>/api/admin/session/callback` a **Authentication > URL Configuration > Redirect URLs**. En local se utiliza `http://127.0.0.1:3000`. El callback utiliza PKCE y solo redirige a `/admin`.
4. En `/admin`, solicita el enlace con el correo preparado y ábrelo en el mismo navegador. Comprueba también el cierre de sesión y que una cuenta sin rol no accede al catálogo editorial.

Para usar códigos, selecciona `GAMEZONE_EDITOR_EMAIL_METHOD=code` e incluye `{{ .Token }}` en la plantilla **Magic Link**. El panel de Supabase puede exigir SMTP propio o un plan compatible para editar esa plantilla. El correo integrado tiene restricciones para las pruebas; configura un SMTP propio antes de admitir destinatarios externos. [Acceso sin contraseña](https://supabase.com/docs/guides/auth/auth-email-passwordless), [configuración de correo](https://supabase.com/docs/guides/auth/auth-smtp).

El navegador solo llama a las rutas de GameZone. Las sesiones usan cookies HttpOnly, renovación en servidor mediante `src/proxy.ts` y comprobación del usuario y su rol vigente en cada operación. Las API siguen admitiendo tokens Bearer de Supabase, verificados en servidor. No se usa el contenido de una cookie o un JWT sin verificar como prueba de autorización. [Sesiones SSR oficiales](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

## Noticias editoriales

El panel `/admin` incluye una sección **Noticias** con creación, guardado de borradores, vista previa, publicación y retirada. `news_records` es una tabla privada; el servidor proyecta exclusivamente el snapshot `published` hacia `/noticias.html`, la portada y `/noticias/<slug>.html`. Guardar un cambio no altera la noticia pública. Publicar exige la revisión esperada y reserva su slug incluso si después se retira el artículo.

Ni `anon` ni una cuenta de miembro pueden leer borradores o ejecutar las RPC `news_create_record` y `news_update_record`. Las API de GameZone comprueban la sesión editorial y el origen de las escrituras. El recorrido y las pruebas están descritos en [Noticias de GameZone](../docs/NOTICIAS.md).

## Discord y perfiles de miembros

1. Aplica `202610300004_member_profiles.sql` y configura una aplicación OAuth de Discord. En Discord registra el callback de **Supabase**, con formato `https://<project-ref>.supabase.co/auth/v1/callback`. Guarda el identificador y el secreto OAuth en la configuración del proveedor Discord de Supabase, nunca en el código público. [Configuración oficial de Discord](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord).
2. En las redirecciones autorizadas de Supabase añade `<origen>/api/account/discord/callback`. Este segundo callback pertenece a GameZone. `NEXT_PUBLIC_SITE_URL` debe coincidir exactamente con el origen que utilizará el navegador, incluido protocolo y puerto.
3. Activa `GAMEZONE_DISCORD_LOGIN_ENABLED=1` en el servidor después de completar la configuración y comprobar el recorrido real. El acceso de miembros se abre en `/cuenta.html`; la entrada de cuenta de la cabecera original se añade solamente cuando la integración está disponible.
4. Comprueba la autorización con Discord, regreso a GameZone, lectura y edición del perfil propio, cambio y restauración de foto y cierre de sesión. Verifica por separado que ese miembro no puede acceder a noticias o juegos del panel sin un rol editorial.

La tabla `profiles` contiene nombre visible, biografía y referencias de foto. No almacena correos ni roles editoriales. RLS permite a cada miembro leer su perfil y actualizar sus columnas `display_name` y `bio`; las rutas y la referencia de avatar las administra el servidor.

`profile-avatars` es un bucket **privado**. El servidor valida y decodifica las imágenes JPG, PNG o WebP, limita tamaño y píxeles y las normaliza a WebP de 256 × 256. Los objetos usan un directorio con el UUID del propietario y no se habilita la subida directa de archivos sin normalizar mediante políticas de Storage. La foto personalizada se sirve por la ruta autenticada `/api/account/avatar`, con caché privada y sin almacenamiento público. Las referencias de avatar de Discord se limitan al CDN admitido por el adaptador. [Control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).

Estos pasos describen la configuración requerida. La existencia de los archivos SQL o de una prueba con HTTP simulado no confirma que OAuth, RLS o la subida real estén comprobados en un proyecto remoto.

## GitHub

El código y las migraciones se versionan en `ImPaul17/GameZone`. La integración del proyecto con ese repositorio usa `.` como directorio de trabajo. Inicialmente, el despliegue automático de producción está desactivado; la conexión con GitHub no sustituye la transferencia de los datos locales ni la configuración privada del servidor.

Antes de activar despliegues automáticos hay que publicar y revisar las migraciones en el repositorio, comprobar su historial en el proyecto y decidir la rama de producción. Las ramas de vista previa dependen del plan de Supabase. [Integración oficial de GitHub](https://supabase.com/docs/guides/deployment/branching/github-integration).

## Desarrollo local

Sin configuración remota se mantiene SQLite en `.data/gamezone.db`. Puede seleccionarse otra ruta mediante `GAMEZONE_DATABASE_PATH`. Para copiar una base mientras el servidor está en marcha hay que tener en cuenta sus archivos WAL; el script de migración obtiene una instantánea coherente con una conexión de solo lectura.

El acceso local exige `GAMEZONE_LOCAL_MODE=1`, contraseña de al menos 12 caracteres y secreto de sesión de al menos 32. Solo se permite en loopback. Las cookies firmadas caducan a las ocho horas; cambiar la contraseña o el secreto invalida las sesiones locales existentes. En un despliegue público debe utilizarse Supabase.
