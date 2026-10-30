# GameZone

Portal de videojuegos para PC con **la web pública original conservada** y un panel editorial separado en **React, Next.js y TypeScript**. Next.js aporta el servidor, la persistencia y las integraciones. El catálogo, las fichas y el buscador reciben los datos publicados manteniendo el aspecto, el HTML, el CSS y las rutas `.html` de GameZone.

**No se está rediseñando la web pública.** Los cambios visuales futuros requieren una petición expresa del propietario. Los HTML originales son las páginas y plantillas activas, no una referencia para sustituirlas por otro diseño.

## Arrancar en local

Requiere Node.js 22.14 o posterior. En PowerShell usa `npm.cmd` si la política del sistema bloquea `npm.ps1`.

```powershell
npm.cmd ci
node scripts/setup-local.mjs
npm.cmd run dev
```

- Web: http://127.0.0.1:3000
- Panel: http://127.0.0.1:3000/admin
- Cuenta: http://127.0.0.1:3000/cuenta.html
- Sin Supabase: contraseña `GAMEZONE_ADMIN_PASSWORD` del archivo privado `.env.local`.
- Con Supabase: acceso por correo de una cuenta con rol editorial.

La preparación genera credenciales aleatorias y nunca sobrescribe una configuración existente. `.env.local`, la base de datos y las cachés están excluidos de Git. El servidor local escucha exclusivamente en loopback; esta configuración no debe publicarse como autenticación de producción.

El catálogo local se inicializa con las nueve fichas del repositorio original. Los cambios persisten en `.data/gamezone.db`, con borrador y versión publicada separados. **No borres ese archivo para actualizar la aplicación**: contiene las ediciones locales. Puedes seleccionar otra base mediante `GAMEZONE_DATABASE_PATH`.

## Recorrido editorial

1. Entrar en el panel e importar la URL HTTPS de una publicación de `pivigames.blog`, o crear una ficha manual.
2. Revisar la propuesta por campo, sus avisos y fuentes. Importar no guarda ni publica por sí solo.
3. Completar título, slug, resumen, descripción, portada, géneros, plataformas, requisitos, versiones y enlaces.
4. Guardar el borrador y revisar la vista previa en un iframe con el mismo formato de publicación original, sin ejecutar scripts. Cerrar y volver al panel conserva el trabajo guardado.
5. Publicar para actualizar la ficha pública, catálogo y buscador. Los cambios posteriores quedan privados hasta volver a publicar.

La reimportación propone diferencias y preserva los cambios editoriales. Un origen ya vinculado no crea otro juego. Una coincidencia por slug se presenta para revisión antes de vincularla; cambiar de juego o edición exige resolver esa identidad, no fusionarla automáticamente.

La sección **Noticias** del panel permite crear artículos con portada, resumen, texto, etiquetas y fuente; guardar borradores, revisar la vista previa, publicar y retirar. Las noticias publicadas aparecen en la portada, en `/noticias.html` y en `/noticias/<slug>.html`, reutilizando los estilos originales. Los cambios de un borrador no alteran el artículo público hasta volver a publicarlo. Sin artículos, la página de noticias original permanece intacta. [Recorrido de noticias](docs/NOTICIAS.md).

## Cuentas con Discord

`/cuenta.html` añade un espacio personal con la tipografía y los colores de GameZone: acceso con Discord, alias, biografía, foto y cierre de sesión. El avatar inicial procede de Discord; cada usuario puede sustituirlo por un JPG, PNG o WebP de hasta 4 MiB, o recuperar su foto de Discord. El servidor normaliza las imágenes a WebP de 256 × 256 sin metadatos y las guarda en un bucket privado.

El perfil y el correo solo se muestran al propio usuario. Registrarse con Discord no concede acceso al panel editorial. Las cuentas requieren Supabase y `GAMEZONE_DISCORD_LOGIN_ENABLED=1`; cuando se habilitan, el menú original incorpora «Mi cuenta», también dentro del menú desplegable móvil. El enlace al servidor de Discord se conserva. [Configuración y permisos](docs/CUENTAS_DISCORD.md).

Las fichas existentes utilizan su HTML original. Las nuevas publicaciones se generan con la plantilla original de PEAK y sus estilos. El renderizador del servidor actualiza los campos de contenido y las tarjetas del catálogo; React se utiliza en el panel de administración aparte. El buscador conserva su aspecto original y corrige la interpolación que permitía XSS.

La importación lee HTML/WordPress REST como datos, con límites y validación de red; no ejecuta scripts ni visita los archivos de descarga. Las fechas editoriales y las distribuciones externas permanecen separadas del lanzamiento y los datos oficiales del juego.

## Fuentes complementarias

El editor admite referencias oficiales manuales. IGDB está preparado como conector opcional: configura `TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET` en servidor, tras resolver sus condiciones de uso. Devuelve candidatos y propuestas que requieren selección y revisión; no modifica automáticamente la publicación. Sin credenciales, el panel informa de ello y permite continuar.

Se comprobaron publicaciones públicas reales de PiviGames. El catálogo ya se ha transferido y verificado contra el proyecto propio de Supabase; los permisos anónimos se han comprobado. IGDB autenticado sigue pendiente de credenciales.

## Pruebas

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.data\browsers'
node node_modules/playwright/cli.js install chromium
npm.cmd run test:e2e
```

Las pruebas de navegador levantan el build en el puerto 3100 con una base aislada y credenciales temporales. La respuesta de importación se simula en el recorrido de UI para que sea repetible; el parser, el transporte y el almacenamiento tienen pruebas separadas. Las comprobaciones en vivo de PiviGames se realizan aparte. Las capturas locales quedan en `.data/qa/`.

## Producción y trabajo pendiente

La configuración y las migraciones de Supabase están en [supabase/README.md](supabase/README.md). El panel admite acceso local y acceso de editores de Supabase por enlace de correo con PKCE o por código. La sesión se guarda en cookies HttpOnly, se renueva en el servidor y comprueba el rol editorial en cada operación. Solicitar acceso no crea cuentas ni concede roles.

`GAMEZONE_EDITOR_EMAIL_METHOD=link` utiliza la plantilla predeterminada de Supabase y exige abrir el enlace en el mismo navegador donde se solicitó. `code` permite introducir el código cuando el proveedor de correo y la plantilla correspondiente estén configurados. El proyecto propio está vinculado con `ImPaul17/GameZone`, inicialmente con despliegue manual.

Antes de activar Supabase hay que aplicar el SQL, trasladar el catálogo local y configurar el correo y el usuario editor. Prepara las claves en el archivo privado `.env.supabase.local`; no las pegues en el chat ni las añadas a Git. La configuración incompleta no activa el acceso local como sustituto. El acceso por enlace y la lectura del catálogo ya se han probado en local contra el proyecto propio; antes del despliegue público quedan el dominio, el correo para destinatarios externos y las comprobaciones del alojamiento elegido.

Quedan bibliotecas, listas, comentarios y moderación de comunidad, eliminación de cuenta desde el producto, historial completo recuperable, newsletter y configuración pública de dominio/proveedores. El editor de noticias y la base de cuentas con Discord ya están implementados; las pruebas de código y navegador no sustituyen la comprobación del proveedor real y del alojamiento de producción.

Los datos migrados mantienen la procedencia y antigüedad del archivo original; no se presentan como comprobados en 2026. Antes de publicación pública hay que revisar datos, fuentes, medios y enlaces, además de completar autenticación y comprobar el entorno de producción.

## Documentación y recursos

- [Plan y fases](docs/PLAN_MEJORA.md)
- [Importación y panel](docs/IMPORTACION_PIVIGAMES.md)
- [Editor de noticias](docs/NOTICIAS.md)
- [Cuentas y Discord](docs/CUENTAS_DISCORD.md)
- [Fuentes y prioridad por campo](docs/FUENTES_DATOS_JUEGOS.md)
- [Estado de implementación](docs/ESTADO_IMPLEMENTACION.md)

Los HTML originales de la raíz y `games/` se sirven como web pública mediante el renderizador de `src/modules/legacy/`. El panel React y las API viven en `src/`; los recursos servidos están en `public/`. `scripts/migrate-legacy.mjs` reconstruye la semilla desde los HTML sin visitar enlaces externos; no modifica una base ya inicializada.

Las URLs originales se mantienen: `/index.html`, `/games.html`, `/buscar.html`, las páginas informativas y `/games/<slug>/<slug>.html`. Los alias nuevos, como `/juegos` o `/juegos/<slug>`, redirigen hacia esas rutas originales. `secret.html` conserva el Snake y su acceso Konami.

Este repositorio conserva su política original: proyecto del autor, sin licencia pública declarada ni autorización general de reutilización. Recursos de terceros conservan sus condiciones; no se añade una licencia a fuentes, sonidos, imágenes o logotipos. La documentación histórica de EmailJS permanece como referencia y no describe el funcionamiento del nuevo panel.
