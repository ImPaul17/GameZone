# Cuentas de miembros con Discord

GameZone incorpora acceso con Discord y un perfil privado en `/cuenta.html`: alias, biografía, correo de la propia cuenta y foto. La web pública conserva sus páginas, estilos y rutas originales. El acceso editorial continúa separado: **tener una cuenta no concede ningún rol de editor o administrador**.

El código y las pruebas locales están preparados. La configuración del proveedor y el recorrido real de autorización con Discord deben comprobarse en el proyecto propio; este documento no acredita que esa prueba real se haya completado.

## Preparar Supabase y Discord

1. Aplica las migraciones anteriores y después [202610300004_member_profiles.sql](../supabase/migrations/202610300004_member_profiles.sql). Crea `public.profiles`, sus permisos y el bucket privado `profile-avatars`.
2. Crea una aplicación en el [portal de desarrolladores de Discord](https://discord.com/developers/applications). En su configuración OAuth2 registra la URL de retorno de **Supabase**:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

3. En **Supabase > Authentication > Sign In / Providers > Discord**, introduce el Client ID y el Client Secret de esa aplicación y habilita el proveedor. El secreto se guarda allí, de forma privada; no pertenece al código, al chat ni a una variable `NEXT_PUBLIC_` de GameZone. Para admitir miembros nuevos, la configuración de Auth debe permitir crear usuarios mediante el proveedor. [Configuración oficial de Discord en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord).
4. Configura **Authentication > URL Configuration** con el origen de GameZone y añade a **Redirect URLs** el retorno a la aplicación:

   ```text
   http://127.0.0.1:3000/api/account/discord/callback
   ```

   En producción utiliza el dominio definitivo con HTTPS, por ejemplo:

   ```text
   https://gamezone.example/api/account/discord/callback
   ```

   Esta URL pertenece a GameZone; es distinta de la URL de Supabase registrada en Discord. Conserva también `/api/admin/session/callback` si utilizas el acceso editorial por enlace. [URLs de retorno admitidas por Supabase](https://supabase.com/docs/guides/auth/redirect-urls).
5. Prepara la configuración privada del servidor con las tres claves de Supabase y el origen exacto:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave-publica>
   SUPABASE_SECRET_KEY=<clave-secreta-solo-servidor>
   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
   GAMEZONE_DISCORD_LOGIN_ENABLED=0
   ```

6. Comprueba la configuración del proveedor, la migración y las URLs; después activa `GAMEZONE_DISCORD_LOGIN_ENABLED=1` y reinicia el servidor. El valor predeterminado de los ejemplos es `0`: sin configuración completa, el acceso se presenta como no disponible.

`NEXT_PUBLIC_SITE_URL` admite un origen HTTPS o HTTP exclusivamente en loopback, sin rutas ni parámetros. El navegador debe utilizar exactamente ese host y puerto: para esta configuración, entra por `127.0.0.1`, no por `localhost`. En producción establece el dominio HTTPS tanto en el servidor como en las URLs admitidas por Supabase. Las instrucciones de transferencia del catálogo y activación del almacenamiento remoto están en [supabase/README.md](../supabase/README.md).

## Sesión y permisos

El botón de acceso llama a `POST /api/account/discord`. El servidor prepara PKCE, guarda el verificador en cookies HttpOnly y devuelve únicamente la URL de autorización. Se solicitan los permisos `identify` y `email`; no se solicita acceso a servidores, bots o mensajes. El callback intercambia el código, verifica el usuario y devuelve a `/cuenta.html`. El recorrido utiliza el mismo navegador y no acepta un destino `next` proporcionado por el cliente. [Flujo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

La sesión de Supabase se comparte con el panel si la misma persona tiene permisos editoriales. La autorización sigue comprobándose por separado contra `editor_roles` en cada operación del administrador. El inicio con Discord no crea ni modifica esos roles.

Las cookies conservan su nombre anterior para mantener las sesiones compatibles. La renovación del servidor se limita a `/admin`, sus API, `/cuenta.html` y `/api/account/`; las páginas públicas originales no pasan por esa renovación. El cierre de sesión usa `scope: 'local'`: cierra esta sesión del navegador, incluido su acceso editorial, sin cerrar las sesiones de otros dispositivos. Los access tokens ya emitidos mantienen su vigencia hasta caducar. [Cierre de sesión de Supabase](https://supabase.com/docs/guides/auth/signout).

## Perfil y fotos privadas

La tabla de perfiles almacena el UUID del usuario, alias, biografía y referencias de sus fotos. **No almacena correos ni roles editoriales.** El correo del perfil se obtiene del usuario verificado y solo se devuelve a su propia sesión. No hay un directorio público de miembros.

Las políticas RLS permiten leer el perfil propio y actualizar únicamente alias y biografía. Las referencias de imágenes y la creación del perfil las gestiona el servidor después de verificar la identidad; el cliente no elige UUID, rutas de archivos ni campos administrativos.

La foto inicial de Discord solo admite URLs validadas de `cdn.discordapp.com`. Una foto personalizada admite un único archivo JPG, PNG o WebP de hasta 4 MiB. El cuerpo multipart completo está limitado a 4 MiB más 64 KiB para su envoltorio. El servidor comprueba la firma binaria y el formato, limita la entrada a 20 megapíxeles y utiliza Sharp para producir un WebP de 256 × 256 sin metadatos EXIF. SVG y archivos de otros formatos se rechazan.

El bucket `profile-avatars` es privado. Los objetos utilizan rutas `<uuid-propio>/<uuid-archivo>.webp`. Las subidas directas del cliente no están habilitadas: deben pasar por la normalización del servidor. La lectura de Storage se limita a la carpeta propia mediante RLS y la aplicación sirve la imagen desde un endpoint autenticado, sin publicar la ruta privada. Se puede retirar la foto personalizada para volver a la foto de Discord. [Control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Contrato del módulo

| Ruta | Función |
| --- | --- |
| `POST /api/account/discord` | Iniciar el acceso OAuth; recibe `{}` y devuelve `{url}` con las cookies PKCE. |
| `GET /api/account/discord/callback` | Intercambiar el código y volver a `/cuenta.html`; los fallos usan `login=expired` o `login=unavailable`. |
| `GET /api/account/profile` | Devolver el perfil de la sesión propia. |
| `PATCH /api/account/profile` | Guardar `displayName` y/o `bio`; rechaza otros campos. |
| `POST /api/account/avatar` | Subir una imagen multipart en el campo `file`. |
| `GET /api/account/avatar` | Leer únicamente la imagen personalizada de la sesión propia. |
| `DELETE /api/account/avatar` | Retirar la imagen personalizada. |
| `DELETE /api/account/session` | Cerrar la sesión de este navegador. |

El perfil devuelto contiene `id`, `displayName`, `bio`, `avatarURL`, `avatarSource` y el correo propio `email`. Las respuestas privadas no se almacenan en cachés compartidas.

## Verificación

```powershell
npm.cmd exec vitest run tests/accounts.test.ts tests/auth.test.ts tests/supabase-auth.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Las pruebas usan el SDK real con transporte HTTP simulado; comprueban PKCE, aislamiento entre usuarios, separación de permisos editoriales, cierre de la sesión actual y tratamiento de imágenes. No sustituyen la comprobación real del proveedor.

En el proyecto propio, el proveedor Discord y ambos callbacks ya están configurados, tanto para desarrollo como para `https://gamezone-impaul17.netlify.app`. La Site URL utiliza ese origen público. El propietario completó el acceso en ambos entornos y confirmó su perfil; se verificaron en Supabase la identidad Discord, su foto y la conservación del rol editorial existente. Su sesión de producción también accede al panel y al editor de noticias. La credencial se introdujo directamente en Supabase y no forma parte del repositorio. El estado y los límites de cada comprobación se recogen en [Estado de implementación](ESTADO_IMPLEMENTACION.md).

Cuando se cambie de dominio, vuelve a comprobar las URLs permitidas, el acceso con Discord, los cambios de perfil y el cierre de sesión. La separación entre miembro y editor y el aislamiento de fotos tienen pruebas automatizadas; la prueba de almacenamiento real utilizó una imagen sintética, sin sustituir la foto personal del propietario. Conserva las credenciales y los archivos privados fuera de Git.
