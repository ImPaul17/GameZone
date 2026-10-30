# Noticias de GameZone

El editor de noticias permite preparar y publicar artículos desde `/admin` sin modificar los HTML a mano. La web conserva sus fuentes, cabecera, pie, estilos y rutas originales. Las noticias se incorporan a los espacios existentes; las dos promociones ancladas de la portada se mantienen.

## Preparar y revisar una noticia

1. Inicia sesión con una cuenta editorial y abre **Noticias** en el panel.
2. Pulsa **Crear noticia** y completa título, resumen, texto, portada y texto alternativo. Separa los párrafos con una línea en blanco y las etiquetas con comas. El enlace de fuente es opcional y debe usar HTTPS.
3. Guarda el borrador. Puedes recargar el panel y continuar editando la misma noticia; todavía no tendrá una página pública.
4. Abre **Vista previa de noticia** para comprobar el artículo con la plantilla y la tipografía originales. El iframe no ejecuta scripts ni eventos del documento y no publica ni guarda automáticamente.
5. Pulsa **Publicar noticia** cuando el contenido esté revisado. A partir de ese momento aparecerá en el listado, en su URL de detalle y entre las noticias recientes de la portada.

Para publicar hacen falta un resumen de al menos 30 caracteres, un párrafo de al menos 50, una portada y su descripción accesible. El contenido se guarda como texto: escribir etiquetas HTML no inserta scripts, widgets ni iframes en el artículo. Los enlaces y las imágenes se tratan como datos; el editor de noticias no visita una fuente ni importa un artículo remoto automáticamente.

## Borrador y publicación son versiones distintas

Cada noticia tiene una identidad estable, un borrador y, cuando se publica, una copia pública separada. **Guardar borrador** conserva el trabajo editorial y deja visible la última versión publicada. **Publicar cambios** sustituye esa copia pública. La fecha pública corresponde a esa publicación y no a las ediciones privadas posteriores.

Cada guardado incrementa la revisión. Si dos pestañas parten de la misma revisión, solo una puede guardar: la otra recibe un conflicto y conserva sus campos para compararlos antes de recargar. No se sobrescribe silenciosamente la versión más reciente del servidor.

El slug puede cambiar mientras la noticia no se haya publicado. Después de la primera publicación queda reservado, también al retirar el artículo, para mantener su identidad y evitar reutilizar enlaces antiguos.

**Retirar noticia** oculta el artículo y lo elimina de la portada y del listado. Conserva el contenido como borrador; la URL pública responde con 404 hasta que vuelva a publicarse. No existe borrado definitivo desde esta primera versión del panel.

## Rutas y diseño público

| Ruta | Contenido |
| --- | --- |
| `/admin` → **Noticias** | Listado editorial, creación, borradores, vista previa y publicación. |
| `/noticias.html` | Noticias publicadas ordenadas por fecha. Sin publicaciones, conserva literalmente la página original de «próximamente». |
| `/noticias/<slug>.html` | Artículo publicado con cabecera, pie y fuente originales. Un borrador o artículo retirado devuelve 404. |
| `/` y `/index.html` | Hasta seis noticias recientes añadidas después de las dos promociones originales. |

La portada reutiliza sus tarjetas existentes. El listado de noticias aprovecha la grilla y las tarjetas de la página original, y el detalle utiliza su hero y contenedor de contenido. No se ha sustituido el diseño público por el del panel React. Las fuentes y los recursos del artículo se resuelven desde la raíz para que funcionen también bajo `/noticias/<slug>.html`.

Si el SDK opcional de EmailJS no carga, las páginas con artículos siguen registrando su inicialización y muestran el contenido. Esto no implementa una newsletter real: el sistema de avisos original permanece como función separada pendiente de conectar.

## Almacenamiento y permisos

En local se utiliza `news_records` dentro de la misma base SQLite seleccionada por `GAMEZONE_DATABASE_PATH`; la tabla se crea vacía y no altera las fichas de juegos. En Supabase se necesita [`202610300003_news_editorial.sql`](../supabase/migrations/202610300003_news_editorial.sql). El adaptador no sustituye un fallo remoto por almacenamiento local.

RLS está activado y las tablas y RPC editoriales solo están disponibles para el servidor con `service_role`. Las rutas `/api/admin/news`, `/api/admin/news/<id>` y `/api/admin/news/preview` comprueban permisos editoriales; las escrituras también exigen el mismo origen. Una cuenta de miembro con Discord no concede acceso al panel.

La web pública recibe exclusivamente los campos de la copia publicada. No recibe el borrador, la revisión privada ni las credenciales del servidor. La vista previa requiere sesión editorial y devuelve HTML sin scripts ni manejadores de eventos.

El script actual `scripts/migrate-to-supabase.mjs` transfiere únicamente fichas de juegos. Si existen noticias locales, no cambies a una tabla remota vacía suponiendo que se transferirán automáticamente: conserva SQLite y prepara una migración específica.

## Comprobar el recorrido

Las pruebas unitarias cubren persistencia entre conexiones, separación de snapshots, retirada, reserva de slug, concurrencia, validación de enlaces y contenido inerte. Las pruebas del renderizador comprueban las promociones originales, el diseño sin noticias, el detalle y la vista previa, incluido el caso de EmailJS no disponible.

```powershell
npm.cmd test -- tests/news.test.ts tests/news-renderer.test.ts tests/legacy-renderer.test.ts
```

El recorrido de navegador está en `tests/e2e/news.spec.ts` y requiere un build actualizado:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/news.spec.ts
```

Playwright utiliza el puerto 3100, una base SQLite aislada y credenciales temporales. Las pruebas crean contenido sintético en esa base; no publican noticias en Supabase ni modifican el catálogo real. La aplicación de SQL y las comprobaciones de permisos y OAuth en un proyecto remoto se verifican por separado.
