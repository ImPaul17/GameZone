# Catálogo editorial y acceso en Supabase

La web pública conserva los HTML, los estilos y las rutas originales. Supabase sustituye el almacenamiento local y gestiona la identidad del editor. Tener una cuenta de Supabase Auth no concede permisos editoriales por sí solo.

## Preparar el proyecto

1. Crea el proyecto propio y guarda su contraseña de base de datos de forma privada.
2. Aplica, por orden, `migrations/202610300001_editorial_catalog.sql` y `migrations/202610300002_import_catalog_snapshots.sql`. Las tablas y RPC editoriales quedan accesibles únicamente al servidor mediante `service_role`; RLS está activado.
3. Copia `.env.supabase.example` a `.env.supabase.local` y completa la URL del proyecto, la clave pública y la clave secreta del servidor. Este archivo está excluido de Git. No actives aún esos valores en `.env.local`: primero transfiere el catálogo.

Las claves nuevas `sb_secret_…` se envían únicamente en `apikey`; las claves antiguas `service_role` también se admiten. La clave secreta nunca debe llevar prefijo `NEXT_PUBLIC_` ni entregarse al navegador. [Claves de Supabase](https://supabase.com/docs/guides/api/api-keys).

## Transferir el catálogo existente

Detén las escrituras editoriales durante la transferencia. Conserva `.data/gamezone.db`: no se borra ni se sustituye al migrar. El script necesita Node.js 22.14 o posterior.

```powershell
node --experimental-strip-types scripts/migrate-to-supabase.mjs --env-file .env.supabase.local
node --experimental-strip-types scripts/migrate-to-supabase.mjs --env-file .env.supabase.local --apply
```

El primer comando es una comprobación sin escrituras. `--apply` guarda una copia privada en `.data/migrations/`, envía una operación transaccional y comprueba después el contenido. Preserva UUID, borrador, versión publicada, revisión, fechas, fuente, referencia de la última importación y reserva del slug. Una repetición con datos idénticos no crea duplicados. Cualquier conflicto bloquea la importación completa: no sobrescribe el catálogo remoto.

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

## GitHub

El código y las migraciones se versionan en `ImPaul17/GameZone`. La integración del proyecto con ese repositorio usa `.` como directorio de trabajo. Inicialmente, el despliegue automático de producción está desactivado; la conexión con GitHub no sustituye la transferencia de los datos locales ni la configuración privada del servidor.

Antes de activar despliegues automáticos hay que publicar y revisar las migraciones en el repositorio, comprobar su historial en el proyecto y decidir la rama de producción. Las ramas de vista previa dependen del plan de Supabase. [Integración oficial de GitHub](https://supabase.com/docs/guides/deployment/branching/github-integration).

## Desarrollo local

Sin configuración remota se mantiene SQLite en `.data/gamezone.db`. Puede seleccionarse otra ruta mediante `GAMEZONE_DATABASE_PATH`. Para copiar una base mientras el servidor está en marcha hay que tener en cuenta sus archivos WAL; el script de migración obtiene una instantánea coherente con una conexión de solo lectura.

El acceso local exige `GAMEZONE_LOCAL_MODE=1`, contraseña de al menos 12 caracteres y secreto de sesión de al menos 32. Solo se permite en loopback. Las cookies firmadas caducan a las ocho horas; cambiar la contraseña o el secreto invalida las sesiones locales existentes. En un despliegue público debe utilizarse Supabase.
