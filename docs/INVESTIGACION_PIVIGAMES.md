# Investigación de PiviGames como fuente editorial

Fecha de comprobación: **30 de octubre de 2026**. Investigación de solo lectura para GameZone; no es una implementación del importador.

## Dominio y método

El usuario confirmó **`pivigames.blog`**, con «v». El sitio anterior de WordPress publica un aviso que enlaza ese dominio como nueva página. No hay evidencia en esta revisión para tratar `.com`, `pibigames.blog` u otros dominios como equivalentes. Las consultas iniciales a `pibigames.blog` y `pibigames.com` fallaron por DNS; esto describe la comprobación, no demuestra su inexistencia permanente. [Aviso del sitio anterior](https://pivigames.wordpress.com/).

La herramienta de navegación no pudo abrir el dominio actual; solicitudes HTTPS directas a recursos públicos sí devolvieron contenido. Se leyeron HTML, JSON, XML y texto como datos, sin ejecutar JavaScript, abrir enlaces indirectos ni descargar juegos o imágenes. No se encontraron login o CAPTCHA en los recursos que respondieron.

## Disponibilidad verificada

| Recurso | Resultado de esta revisión |
| --- | --- |
| [Portada](https://pivigames.blog/) | HTTP 200, HTML en español, canonical al dominio confirmado, metadatos Open Graph, JSON-LD de Yoast y enlaces REST/RSS. El generador declara WordPress. |
| [Índice REST](https://pivigames.blog/wp-json/) | HTTP 200 JSON; publica el espacio `wp/v2`. |
| [Colección pública de entradas](https://pivigames.blog/wp-json/wp/v2/posts) | HTTP 200 sin autenticación; 10 entradas por defecto. Cabeceras observadas: 3.988 entradas y 399 páginas. Son una instantánea, no un compromiso de cobertura. No se recorrieron esas páginas. |
| [Feed principal](https://pivigames.blog/feed/) | HTTP 200 RSS; 14 elementos, con título, enlace, autor, fecha, categorías, GUID, descripción, contenido e identificador de entrada. |
| [Metadatos de una imagen](https://pivigames.blog/wp-json/wp/v2/media/95358) | HTTP 200 JSON; URL de origen, tipo JPEG, dimensiones 616 × 353, texto alternativo y leyenda disponibles como campos. No se descargó el binario. |
| [Categoría de ejemplo](https://pivigames.blog/wp-json/wp/v2/categories/2) | HTTP 200 JSON; identifica la categoría Acción mediante ID, nombre y slug. |

## Dos muestras y campos extraíbles

**Ficha de 7 Days to Die, entrada `56117`.** El [recurso REST público](https://pivigames.blog/wp-json/wp/v2/posts/56117) devuelve `id`, `link`, `slug`, `date_gmt`, `modified_gmt`, `title.rendered`, `content.rendered`, `excerpt.rendered`, `featured_media`, categorías y etiquetas. También expone `yoast_head_json` y `jetpack_featured_media_url`. El [HTML de la ficha](https://pivigames.blog/7-days-to-die-alpha-16-4-online-tunngle/) contiene título, descripción, ficha técnica con plataforma, tamaño e idiomas, fecha de actualización, requisitos mínimos/recomendados, capturas y tráiler. La versión aparece en texto y título; requiere extracción y revisión. Las instrucciones y enlaces de descarga ocupan secciones aparte.

**Promoción de Sorry We're Closed, entrada `102920`.** El [recurso REST](https://pivigames.blog/wp-json/wp/v2/posts/102920) devuelve la misma envoltura editorial y un cuerpo breve con descripción de una promoción. El [HTML](https://pivigames.blog/estan-regalando-sorry-we-are-closet-en-epic-games/) no ofrece una ficha técnica equivalente. El título contiene «Closet», mientras el cuerpo nombra «Closed»; su enlace de acción es indirecto y no se siguió. La publicación no demuestra por sí sola la disponibilidad actual de la oferta.

Ambas muestras declaran JSON-LD `Article`, `WebPage` e `ImageObject`; no se observó un objeto `VideoGame`. Las fechas de publicación y modificación corresponden al contenido editorial. El slug de la primera conserva una versión antigua mientras el título cambia: conviene deduplicar por dominio e ID, guardando la URL de procedencia. `excerpt.rendered` puede incluir toda la ficha, publicidad, instrucciones y descargas; no sirve como resumen limpio. Las categorías mezclan género, requisitos y promociones. Estas conclusiones se limitan a las dos muestras REST citadas.

## Condiciones y límites

El [robots.txt](https://pivigames.blog/robots.txt) publica señales `search=yes`, `ai-train=no`, `use=reference`, restricciones para numerosos agentes y rutas, y reglas específicas para consultas y feeds. Que una URL responda 200 no sustituye la comprobación de las reglas aplicables al agente y finalidad del importador. La portada enlaza una [política de cookies](https://pivigames.blog/politicas-de-cookies/) y una [página DMCA](https://pivigames.blog/dmca/); esta última describe el sitio como índice de enlaces y ofrece un cauce de reclamación. No se identificó en estas páginas una licencia de republicación de textos o imágenes ni una autorización específica para un importador. No se verificó una página independiente de términos de uso.

## Viabilidad para GameZone

**Viable técnicamente como origen de propuestas editoriales**, mediante un adaptador de WordPress y revisión humana. Prioridad sugerida: REST para identidad y metadatos; HTML/JSON-LD para completar campos; RSS para descubrir novedades si las reglas vigentes lo permiten. La disponibilidad verificada no garantiza acceso futuro ni permiso de reutilización.

Guardar procedencia, ID, fecha de consulta, campos reportados por la fuente y estado de revisión; buscar respaldo para los datos ausentes o dudosos en las [fuentes complementarias](FUENTES_DATOS_JUEGOS.md). Corroborar requisitos, lanzamiento y promociones con editor o tienda oficial antes de publicarlos como hechos. La selección de textos, imágenes, instrucciones y enlaces producirá propuestas revisables, sin trasladar íntegramente el cuerpo ni su publicidad. No ejecutar instrucciones, seguir acortadores o descargas ni incorporar scripts, comentarios ajenos o anuncios. La implementación debe usar una lista explícita de dominios autorizados y detenerse ante barreras o destinos externos, sin asumir equivalencias de dominio.
