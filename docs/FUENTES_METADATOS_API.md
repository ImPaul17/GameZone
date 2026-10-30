# APIs de metadatos para GameZone

Comprobación: **30 de octubre de 2026**. Fuentes primarias y pruebas HTTP de solo lectura; sin crear cuentas, utilizar credenciales ni descargar juegos. Complementa la [investigación de PiviGames](INVESTIGACION_PIVIGAMES.md).

## IGDB

`POST https://api.igdb.com/v4/games` usa consultas APICalypse. Requiere aplicación Twitch con 2FA, Client ID, secreto y token OAuth de aplicación; el servidor envía `Client-ID` y `Authorization: Bearer …`. No admite consultas directas desde navegador. Límites publicados: **4 solicitudes/s**, **8 abiertas**, hasta **500 resultados/solicitud**. [Documentación oficial](https://api-docs.igdb.com/#getting-started).

La introducción ofrece gratuidad no comercial y remite los proyectos comerciales a una asociación; la FAQ dice que ambos usos son gratuitos, pero exige tramitar la asociación comercial y atribución visible y estable. **No equivale a permiso comercial automático**. La FAQ permite almacenar y servir datos localmente; las imágenes sustituidas/eliminadas permanecen 30 días. [Condiciones, caché y atribución](https://api-docs.igdb.com/#business-related-faq), [imágenes](https://api-docs.igdb.com/#images).

El esquema oficial permite esta selección mínima; cobertura documental no garantiza que cada ficha esté completa. [Protobuf oficial](https://api.igdb.com/v4/igdbapi.proto).

| Necesidad | Campos/relaciones |
| --- | --- |
| Identidad y tiendas | `id`, `name`, `alternative_names`; `external_games` → `uid`, `url`, `external_game_source`. |
| Clasificación y empresas | `genres`, `themes`, `platforms`; `involved_companies.company` con indicadores `developer`/`publisher`. |
| Lanzamiento e idiomas | `first_release_date`, `release_dates` con plataforma/región/precisión; `language_supports` con idioma/tipo. |
| Multimedia y notas | `cover`, `artworks`, `screenshots`, `videos.video_id`; `rating`, `aggregated_rating`, `total_rating` y sus recuentos. |

Usar `external_game_source`, `game_type` y `game_status`: sustituyen campos antiguos marcados obsoletos. Resolver la fuente Steam/GOG/Epic mediante su tabla, conservando el `uid` como texto. [Migración oficial](https://api-docs.igdb.com/#migration-enums-to-tables).

## RAWG

`GET https://api.rawg.io/api/games` admite búsqueda, filtros y paginación; detalle en `/games/{id}`, capturas en `/games/{game_pk}/screenshots`, vídeos en `/games/{id}/movies` y enlaces comerciales en `/games/{game_pk}/stores`. La API exige `key` en cada petición. Publicita géneros, desarrolladores, editores, fechas, plataformas, multimedia, Metacritic y requisitos. [Presentación y acceso oficiales](https://rawg.io/apidocs), [OpenAPI oficial](https://api.rawg.io/docs/?format=openapi).

**Contradicción sin resolver:** la tabla actual anuncia Free solo no comercial, **20.000 peticiones/mes**; Business **149 USD/mes**, **50.000**; Enterprise hasta **1.000.000**. En esa misma página, el bloque de términos admite gratuidad comercial para proyectos pequeños. No basar la elección comercial en ese último texto aislado. [Planes oficiales](https://rawg.io/apidocs).

Los términos, fechados **1/3/2021**, también permiten comercial gratuito bajo 20.000 peticiones y umbrales de 100.000 usuarios activos/500.000 vistas mensuales; exigen atribución/enlace por página y prohíben redistribuir los datos. Contradicen la tabla vigente: confirmar condiciones aplicables con RAWG antes de activar uso comercial. No se encontró un TTL de caché ni límite por segundo explícitos en estas páginas. [Términos, §§4, 6 y 8](https://rawg.io/tos_api).

El OpenAPI declara `released`, `updated`, `rating`, `rating_top`, `ratings_count`, `metacritic`, imágenes y `platforms[].requirements.minimum/recommended` como texto posiblemente ausente. `GameStoreFull.store_id` identifica la tienda; el enlace `url` permite proponer un Steam App ID, pero no existe un campo `steam_appid` en ese esquema. `GameSingle` omite géneros/empresas pese a publicitarlos; verificar respuestas autenticadas antes de fijar el contrato. Tampoco documenta idiomas de interfaz/audio/subtítulos: `Tag.language` describe la etiqueta. [Esquema oficial](https://api.rawg.io/docs/?format=openapi).

## Acceso comprobado sin claves

| Petición | Resultado observado |
| --- | --- |
| [IGDB games](https://api.igdb.com/v4/games), POST mínimo sin cabeceras de acceso | HTTP 401. |
| [RAWG búsqueda](https://api.rawg.io/api/games?search=Portal%202&page_size=1) y [detalle](https://api.rawg.io/api/games/4200), sin `key` | HTTP 401. |
| [RAWG OpenAPI](https://api.rawg.io/docs/?format=openapi) | HTTP 200; documentación, no catálogo autenticado. |

**Wikidata es un complemento accesible sin cuenta:** [EntityData de Portal 2](https://www.wikidata.org/wiki/Special:EntityData/Q279446.json) respondió 200 con `P1733=620` y `P5794=portal-2`. El segundo es un slug, no el número de IGDB. [Propiedad Steam](https://www.wikidata.org/wiki/Property:P1733), [propiedad IGDB](https://www.wikidata.org/wiki/Property:P5794). Los datos estructurados son CC0; esta licencia no se extiende automáticamente a imágenes enlazadas. Usar consultas acotadas, User-Agent identificable y respetar 429/Retry-After. [Licencia](https://www.wikidata.org/wiki/Wikidata:Licensing), [acceso y caché por revisión](https://www.wikidata.org/wiki/Wikidata:Data_access).

## Aplicación recomendada

Priorizar **IGDB como candidato** para identidad e idiomas y RAWG como alternativa condicionada a aclarar plan y respuesta real. Esta es una recomendación técnica, no una validación de cobertura ni contratación. Mantener proveedor, identificador, URL, fecha de consulta, valor original y revisión editorial por campo; una coincidencia de nombre propone candidatos y una coincidencia de tienda necesita distinguir juego, DLC y edición.

Los esquemas revisados no ofrecen una ficha de paquetes de PiviGames: versión distribuida, tamaño comprimido, formato, instrucciones o enlaces de descarga. IGDB tampoco declara requisitos de hardware del juego; RAWG ofrece texto de requisitos, sin garantía de verificación oficial. Contrastar hardware con tienda/editor y mantener por separado requisitos oficiales, idiomas del juego y datos de una distribución concreta. [Esquema IGDB](https://api.igdb.com/v4/igdbapi.proto), [esquema RAWG](https://api.rawg.io/docs/?format=openapi).
