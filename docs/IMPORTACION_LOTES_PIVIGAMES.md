# Importación de lotes desde PiviGames

Comprobación: **8 de noviembre de 2026**, desde el entorno de GameZone. Investigación de solo lectura y propuesta técnica; no acredita haber importado, revisado o publicado el catálogo completo.

## Resultado y decisión práctica

Existe una vía técnica para descubrir aproximadamente cuatro mil publicaciones sin recorrer las páginas HTML del archivo: el sitio anuncia un índice XML y cuatro sitemaps de entradas. El primero contiene **1.000 URL de publicaciones** en **1.099.563 bytes**. Conviene convertir esas URL en una cola persistente y procesarlas de una en una, reutilizando el importador editorial existente. **Publicación no equivale a juego**: la colección mezcla fichas, promociones y anuncios de otros servicios. [Índice de sitemaps](https://pivigames.blog/sitemap_index.xml), [primer sitemap de entradas](https://pivigames.blog/post-sitemap.xml), [colección REST](https://pivigames.blog/wp-json/wp/v2/posts).

La paginación REST sería más eficiente en peticiones, pero el `robots.txt` actual incluye `Disallow: /*?`. Por ello, el camino recomendado ahora usa URL sin consulta: sitemaps para descubrir y HTML más REST por ID para preparar borradores. No se probaron variantes con parámetros ni rutas alternativas para esquivar esa restricción. [Robots de PiviGames](https://pivigames.blog/robots.txt).

## Alcance de la comprobación pública

Se hicieron **seis GET directos satisfactorios** al dominio: robots, índice XML, primer sitemap de entradas, colección REST por defecto, colección de categorías por defecto y RSS raíz. No se recorrieron los restantes sitemaps, páginas REST, fichas individuales, acortadores, destinos de descarga, imágenes ni binarios. Las cinco consultas posteriores a robots usaron la identificación explícita `GameZone-Editorial/0.1 (+manual editorial research)`. Las tres últimas se limitaron a 2 MiB de respuesta y se espaciaron. La navegación web no pudo abrir robots; la lectura HTTPS directa sí respondió. Ninguna comprobación completada mostró un CAPTCHA o bloqueo que se intentase eludir.

| Recurso público sin parámetros | Evidencia observada el 08/11/2026 |
| --- | --- |
| [robots.txt](https://pivigames.blog/robots.txt) | HTTP 200. Señales de uso de referencia, búsqueda y exclusión de entrenamiento; restricciones por agente y ruta. Prohíbe consultas con `?`, búsquedas, archivos `/page/` y numerosos feeds. Anuncia varios sitemaps. |
| [sitemap_index.xml](https://pivigames.blog/sitemap_index.xml) | HTTP 200, XML, **1.409 bytes**, nueve hijos en total. Cuatro son sitemaps de entradas; los demás corresponden a páginas, categorías, etiquetas, desarrollador/editor y autores. |
| [post-sitemap.xml](https://pivigames.blog/post-sitemap.xml) | HTTP 200, XML, **1.099.563 bytes**, **1.000 elementos `url`**. Incluye metadatos de imágenes: contar únicamente `url > loc`, nunca todos los `loc`. Primer `lastmod`: `2017-04-09T04:35:45+00:00`. |
| [wp-json/wp/v2/posts](https://pivigames.blog/wp-json/wp/v2/posts) | HTTP 200, JSON, **235.940 bytes**, diez objetos. Cabeceras **`X-WP-Total: 3991`**, **`X-WP-TotalPages: 400`**. Son publicaciones disponibles en esa instantánea, no 3.991 juegos válidos. |
| [wp-json/wp/v2/categories](https://pivigames.blog/wp-json/wp/v2/categories) | HTTP 200, JSON, **58.842 bytes**, diez objetos. Cabeceras: **65 categorías / 7 páginas**. La muestra mezcla género, plataforma, exigencia técnica y publicidad. No se paginó. |
| [feed/](https://pivigames.blog/feed/) | HTTP 200, RSS, **125.115 bytes**, **14 elementos**. Expone `ETag` y `Last-Modified: Sat, 07 Nov 2026 19:04:25 GMT`. Útil para novedades; no representa todo el archivo. |

El RSS raíz dispone de una regla específica de permiso frente a reglas genéricas de exclusión de feeds. La selección de la regla más específica y la combinación de grupos aplicables están definidas por el protocolo; no hay que interpretar una primera regla global como autorización para todas las rutas. Robots tampoco es una licencia ni un mecanismo de autorización de acceso. [RFC 9309, apartados 1 y 2.2](https://www.rfc-editor.org/rfc/rfc9309.html), [robots de la fuente](https://pivigames.blog/robots.txt).

### Archivos exactos anunciados para entradas

Los cuatro nombres proceden del índice, sin adivinar numeraciones:

| Sitemap | `lastmod` anunciado en el índice | Lectura realizada |
| --- | --- | --- |
| [post-sitemap.xml](https://pivigames.blog/post-sitemap.xml) | `2026-11-07T19:04:25+00:00` | Sí: 1.000 entradas, tamaño indicado arriba. |
| [post-sitemap2.xml](https://pivigames.blog/post-sitemap2.xml) | `2021-08-19T14:37:46+00:00` | Solo descubierto; contenido y número de entradas no comprobados. |
| [post-sitemap3.xml](https://pivigames.blog/post-sitemap3.xml) | `2025-06-03T17:26:07+00:00` | Solo descubierto; contenido y número de entradas no comprobados. |
| [post-sitemap4.xml](https://pivigames.blog/post-sitemap4.xml) | `2026-11-07T19:04:25+00:00` | Solo descubierto; contenido y número de entradas no comprobados. |

No existe evidencia en esta revisión para pedir `post-sitemap1.xml`. Tampoco es necesario recorrer sitemaps de autores, etiquetas o medios para importar fichas. La presencia en un sitemap no demuestra que una URL contenga un juego importable ni que siga respondiendo. [Índice observado](https://pivigames.blog/sitemap_index.xml).

Tres URL reales del primer mapa, tomadas únicamente como muestra de descubrimiento, sin abrirlas:

- `https://pivigames.blog/blackwood-crossing/`
- `https://pivigames.blog/dead-warfare-zombie-apkdatos-android/`
- `https://pivigames.blog/limbo-apk-datos-android/`

### Muestra breve de identidad y metadatos

La colección REST por defecto devolvió, entre otros objetos, los siguientes datos reportados por la fuente. No se reproducen descripciones ni instrucciones; las fechas son del artículo y no fechas de lanzamiento. [Respuesta pública consultada](https://pivigames.blog/wp-json/wp/v2/posts).

```json
{
  "id": 102743,
  "link": "https://pivigames.blog/castlevania-belmonts-curse-pc-espanol/",
  "title": "CASTLEVANIA BELMONT’S CURSE PC ESPAÑOL v1.1.4",
  "date_gmt": "2026-11-07T13:20:00",
  "modified_gmt": "2026-11-07T18:05:12",
  "categories": [2, 7, 52, 12],
  "featured_media": 102748
}
```

En esa misma respuesta aparecen anuncios de suscripciones de Netflix y Crunchyroll, además de publicaciones de juegos. La muestra de categorías identifica, por ejemplo, el ID `2` como Acción, el `7` como Altos Requisitos y el `50` como Android. Son clasificaciones heterogéneas: almacenar sus identificadores como evidencia de origen resulta más fiel que convertir cada categoría automáticamente en un género. [Entradas](https://pivigames.blog/wp-json/wp/v2/posts), [categorías](https://pivigames.blog/wp-json/wp/v2/categories).

## Qué permite WordPress y qué se ha verificado aquí

La documentación oficial define `page`, `per_page` entre 1 y 100, `offset`, orden y las cabeceras de totales. Así, **3.991 publicaciones necesitarían al menos 40 páginas con 100 objetos**, si esa forma de acceso estuviera permitida y disponible. Es un cálculo sobre la instantánea, no una ejecución ni una promesa de que cada página cumpla el límite de tamaño. Las 400 páginas observadas corresponden al valor por defecto de diez objetos. [Paginación oficial de WordPress](https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/).

La referencia de entradas documenta búsqueda, categorías, identificadores incluidos, orden y ventanas de publicación/modificación. Son herramientas útiles para sincronizaciones cuando exista autorización para consultas. En esta revisión **no se validaron en PiviGames** porque requieren parámetros afectados por robots. [Referencia oficial de Posts](https://developer.wordpress.org/rest-api/reference/posts/).

`_fields` puede pedir solo identidad y metadatos y reducir trabajo del servidor y tamaño del JSON. Sería preferible a descargar cien cuerpos completos durante descubrimiento; también requiere parámetros y queda fuera del camino actual. La referencia de categorías confirma que el ID de un término es su identidad y documenta su paginación y búsqueda. [Parámetros globales oficiales](https://developer.wordpress.org/rest-api/using-the-rest-api/global-parameters/), [referencia oficial de Categories](https://developer.wordpress.org/rest-api/reference/categories/).

Si más adelante el operador autoriza la colección paginada, fijar una fecha de corte, ordenar de forma estable y conservar checkpoint y deduplicación; una colección viva puede cambiar durante el recorrido. Volver a comprobar esquema, límites, reglas y disponibilidad antes de habilitar ese modo. Esta es una recomendación de diseño, no una función comprobada en el sitio.

## Cola propuesta para GameZone

Este apartado define una propuesta para la implementación; consultar los archivos finales y las pruebas del cambio para conocer lo efectivamente entregado.

1. **Descubrir:** aceptar hasta 1.000 URL pegadas por lote o consultar un solo sitemap permitido por petición. El índice devuelve hijos elegibles; un mapa de entradas devuelve exclusivamente sus URL. Validar cada URL con la misma política del importador: HTTPS, dominio exacto, sin credenciales, consulta ni fragmento. No seguir enlaces de imágenes del XML ni expandir archivos de etiquetas/autores. Aplicar límite de XML y rechazar declaraciones DTD/entidades externas.
2. **Persistir antes de procesar:** guardar lote, filtro/archivo de origen, fecha de descubrimiento, URL normalizadas y estados en el almacenamiento editorial. SQLite sirve para la instalación local persistente; en Netlify debe usarse el almacenamiento remoto configurado para producción. Una cola en memoria o en el navegador no basta para reanudar con otro proceso. El repositorio actual ya distingue SQLite local y Supabase remoto. [Repositorio del catálogo](../src/modules/catalog/repository.ts), [configuración Netlify](../netlify.toml).
3. **Procesar un elemento por paso:** una acción autenticada reclama una fila con arrendamiento temporal, importa la publicación y guarda un borrador. El cliente muestra progreso y solicita el siguiente paso mientras el lote esté activo. Cerrar el navegador detiene nuevos pasos; al reabrir se reanuda desde el estado persistido. No afirmar que continúa en segundo plano si no existe un trabajador independiente.
4. **Deduplicar de forma durable:** impedir repetir la misma URL normalizada dentro del lote; después de resolverla, la identidad principal es `pivigames:ID_WordPress`, no el título ni el slug. Guardar la relación con el registro editorial en la misma operación que marca éxito, o recuperarla por identidad tras un fallo. Una repetición no puede crear otra ficha ni sobrescribir automáticamente un borrador editado o una ficha publicada. El catálogo actual ya guarda `source_key` único. [Importador existente](../src/modules/imports/pivigames.ts), [repositorio](../src/modules/catalog/repository.ts).
5. **Checkpoint por elemento:** registrar pendiente, en curso, borrador creado, duplicado, error o descartado, con intentos, próximo intento, error breve y registro resultante. Recuperar un elemento cuyo arrendamiento caducó y comprobar primero si ya se guardó su borrador. Pausar y cancelar deben conservar el avance; reanudar no empieza de cero.
6. **Reintentos con espera registrada:** ante HTTP 429, respetar `Retry-After` y pausar las peticiones al dominio; ante 503/errores transitorios, retrasar con espera creciente y variación aleatoria. Guardar la próxima fecha, devolver control al cliente y reintentar después: no mantener una función dormida. Ante 401, 403, CAPTCHA o una barrera de acceso, pausar para revisión sin cambiar identidad, proxy o ruta para sortearla. Un error de formato/identidad requiere revisión, no intentos infinitos.
7. **Revisión editorial:** cada éxito produce un borrador con origen, ID, fecha de consulta, evidencia y advertencias. Dejar promociones y contenido no clasificable para revisión o descarte. Conservar los controles de publicación y las comprobaciones de campos requeridos; la importación no publica en masa.

Los estados deben persistirse con operaciones atómicas de reclamación y finalización para que dos pestañas o reintentos de plataforma no procesen la misma fila simultáneamente. Un identificador de lote y sus contadores bastan en las respuestas HTTP; los cuerpos completos pertenecen al almacenamiento y al editor de cada borrador.

## Límites operativos recomendados

Estos valores son **decisiones conservadoras iniciales de GameZone**, no cuotas autorizadas por PiviGames:

| Dimensión | Inicio propuesto | Motivo |
| --- | --- | --- |
| Tamaño del lote | 1.000 URL únicas | Coincide con el primer mapa observado; varios lotes permiten abarcar el archivo. |
| Descubrimiento remoto | Un XML por petición, hasta 1.000 URL, 2 MiB | El mapa medido cabe en el límite actual sin cargar fichas. |
| Concurrencia hacia la fuente | Una petición en vuelo, intervalo mínimo de 2 segundos | Evita ráfagas; también debe aplicarse entre lotes y sesiones. No constituye un permiso de rastreo. |
| Procesamiento | Un elemento por paso | El adaptador existente puede hacer dos GET: HTML e identidad REST por ID. |
| Tiempo por GET | 12 segundos, como el transporte existente | Dos consultas de fuente pueden consumir 24 segundos; reservar tiempo adicional para guardar y responder. |
| Presupuesto total del paso | Aproximadamente 40–45 segundos como máximo, con plazo real compartido | Mantiene margen frente al límite síncrono de plataforma; limitar también las llamadas al almacenamiento. |
| Reintentos transitorios | Tres intentos por elemento; esperas iniciales de 30 s, 2 min y posteriormente revisión | Un `Retry-After` mayor manda. Los intentos fallidos no deben bloquear toda la cola indefinidamente. |
| Registro de respuesta | Contadores, progreso y un error breve | Evita devolver cientos de cuerpos o evidencias en cada avance. |

El importador actual fija **2 MiB por respuesta comprimida y descomprimida, 12 s por llamada y hasta dos redirecciones controladas**; comprueba DNS, fija la IP pública a TLS y restringe host/HTTPS. Es necesario conservar esas defensas en descubrimiento. Además, hoy `safeHttps` devuelve cuerpo, URL y tipo, pero no expone cabeceras ni errores HTTP estructurados; para `Retry-After`, peticiones condicionales o totales de paginación habría que ampliar ese contrato. [Transporte actual](../src/modules/imports/safe-http.ts).

Como estimación puramente aritmética, cuatro mil fichas con dos GET cada una suponen hasta ocho mil GET. A un mínimo de dos segundos entre solicitudes son **al menos unas 4 h 27 min**, más latencia, persistencia, revisión y pausas. El descubrimiento de miles de URL es barato; su conversión en miles de borradores es el trabajo prolongado. No ejecutar esa estimación como un solo request ni presentarla como duración garantizada.

## Encaje con Netlify

La documentación de Netlify consultada fija **60 s para funciones síncronas**, **30 s para programadas**, **15 min para background**, **6 MB para payload no transmitido** y **256 KB para payload de background**. Son límites documentados de funciones; no prueban la configuración ni todos los límites del sitio desplegado. Un bucle con miles de importaciones no cabe en un endpoint normal. La ruta propuesta de un elemento por paso evita depender de una ejecución larga. [Configuración oficial de funciones](https://docs.netlify.com/build/functions/configuration/).

Como alternativa futura, Background Functions devuelve 202 al iniciar y puede reintentarse automáticamente al minuto y dos minutos después de otro fallo. Requeriría igualmente cola durable, idempotencia y progreso consultable; no es suficiente cambiar el nombre de la función. Esta investigación no solicita ni añade esa infraestructura. [Background Functions oficial](https://docs.netlify.com/build/functions/background-functions/).

## Procedencia y contenido

Disponibilidad técnica, robots y licencia son cuestiones distintas. Esta comprobación no identifica una autorización del operador para republicar íntegramente textos, medios o distribuciones. La investigación previa tampoco encontró una licencia de republicación en las páginas consultadas; esa comprobación anterior se fecha el 30 de octubre y no se repitió aquí. Usar los datos como propuestas de referencia, redactar la ficha editorial y verificar derechos de medios y afirmaciones antes de publicar. [Investigación anterior](INVESTIGACION_PIVIGAMES.md), [robots actual](https://pivigames.blog/robots.txt).

No convertir la fecha del artículo en lanzamiento, una categoría en género confirmado o un anuncio de oferta en disponibilidad vigente. No abrir enlaces de descarga ni ejecutar instrucciones del contenido. El adaptador actual ya trata esos destinos como datos y añade advertencias; el lote debe mantener ese comportamiento. [Adaptador editorial](../src/modules/imports/pivigames.ts).

## Comprobación de la implementación

Para demostrar la función sin rastrear el archivo completo: descubrir un mapa, mostrar las 1.000 URL sin cargarlas, crear un lote pequeño de dos o tres publicaciones revisables, pausar/reanudar y repetir una URL para comprobar que no se duplica. Simular en pruebas los límites, HTTP 429, errores, caída tras guardar y dos reclamaciones concurrentes. Comprobar persistencia con una nueva sesión y que los resultados son borradores. Una prueba de capacidad con 1.000 URL sintéticas o ya descubiertas no acredita haber importado 1.000 fichas reales.
