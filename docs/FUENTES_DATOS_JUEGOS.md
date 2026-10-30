# Fuentes para completar y contrastar fichas de GameZone

Investigación y propuesta del 30 de octubre de 2026. El importador conserva PiviGames como origen de la publicación y contempla fuentes adecuadas para cada campo ambiguo. Este documento amplía el [plan de mejora](PLAN_MEJORA.md) y la [especificación del importador](IMPORTACION_PIVIGAMES.md). La primera entrega incluye referencias manuales y un conector IGDB configurable; la conexión autenticada real y las fuentes restantes no se consideran verificadas o implementadas por ello.

La combinación recomendada es **tienda o desarrollador para datos técnicos y de lanzamiento**, **IGDB para completar metadatos**, y revisión editorial cuando haya diferencias. RAWG y Wikidata son alternativas complementarias, no requisitos para abrir el panel.

## Fuentes investigadas

| Fuente | Papel propuesto en GameZone | Acceso y limitaciones relevantes |
| --- | --- | --- |
| Tienda oficial de la edición y web del desarrollador/editor | Contrastar requisitos, idiomas, lanzamiento y enlaces oficiales. Las fichas de Steam separan idiomas de interfaz, audio y subtítulos. | Una página visible sirve como referencia editorial; no se presupone una API estable o permiso de extracción automatizada para todos sus campos. [PEAK en Steam](https://store.steampowered.com/app/3527290/PEAK/), [Silksong en Steam](https://store.steampowered.com/app/1030300/Hollow_Knight_Silksong/). |
| IGDB | Principal candidato a enriquecimiento automático de identidad, géneros, compañías, plataformas, fechas y medios. | API documentada con autenticación de aplicación Twitch. Resolver previamente la asociación comercial y atribución que describe el proveedor. [Documentación de IGDB](https://api-docs.igdb.com/). |
| RAWG | Alternativa para contrastar o suplir metadatos si su cobertura y condiciones encajan. | Requiere clave. Hay discrepancias entre su tabla de planes y el texto de condiciones sobre uso comercial gratuito; no asumir que un plan gratuito cubre GameZone. [API y planes](https://rawg.io/apidocs), [condiciones](https://rawg.io/tos_api). |
| Wikidata | Ayudar a relacionar nombres e identificadores y localizar referencias cuando el emparejamiento sea ambiguo. | Datos estructurados bajo CC0 y acceso público; revisar referencias y cobertura por entrada. Un identificador externo puede ser un slug, no necesariamente el ID numérico del proveedor. No usarlo como fuente principal de requisitos o disponibilidad actual. [Acceso](https://www.wikidata.org/wiki/Wikidata:Data_access), [licencia de datos](https://www.wikidata.org/wiki/Wikidata:Licensing), [Steam ID](https://www.wikidata.org/wiki/Property:P1733), [identificador IGDB](https://www.wikidata.org/wiki/Property:P5794). |

Para imágenes, hechos de presentación y tráilers también buscaría los kits de prensa enlazados por el propio estudio, revisando sus condiciones. Por ejemplo, la web oficial de Silksong ofrece un kit destinado a escribir sobre el juego. Eso no concede una licencia general para cualquier recurso encontrado en Internet. [Web oficial de Silksong](https://hollowknightsilksong.com/), [juegos de Team Cherry](https://www.teamcherry.com.au/games).

El esquema de IGDB revisado no ofrece requisitos de hardware del juego. RAWG contempla requisitos por plataforma, pero son texto y pueden faltar. Por eso la prioridad propuesta para hardware sigue siendo la fuente oficial de la edición. [Esquema de IGDB](https://api.igdb.com/v4/igdbapi.proto), [esquema de RAWG](https://api.rawg.io/docs/?format=openapi).

La investigación técnica de APIs y la comprobación de tiendas se conservan en [metadatos de APIs](FUENTES_METADATOS_API.md) y [fuentes oficiales](FUENTES_OFICIALES_JUEGOS.md). Son evidencia y límites de acceso, no proveedores ya contratados o conectados.

## Qué fuente prevalece para cada dato

Esta prioridad es una decisión de diseño para GameZone, no una garantía de exactitud de un proveedor.

| Dato | Prioridad propuesta | Precaución de interpretación |
| --- | --- | --- |
| Nombre e identidad | Identificador de tienda confirmado; después coincidencia revisada con IGDB u otra base | Distinguir juego base, remake, remaster, edición Enhanced, DLC y bundles. Un título parecido no basta. |
| Desarrollador y editor | Créditos/web oficial y tienda de la edición; agregador para completar | Admitir varias compañías y distinguir funciones. |
| Fecha de lanzamiento | Fuente oficial correspondiente a plataforma, edición, región y evento | Separar acceso anticipado, lanzamiento completo y fecha editorial de PiviGames. Una fecha global del juego no siempre es la de PC. |
| Requisitos mínimos/recomendados | Soporte del desarrollador/editor o tienda de esa versión y sistema operativo | Conservar mínimo y recomendado separados. Si dos fuentes oficiales discrepan, mostrar ambas con fecha y alcance. |
| Idiomas | Tabla oficial de la edición | Separar interfaz, voces y subtítulos; no deducir doblaje por la etiqueta «español». |
| Géneros y modos | Propuesta de IGDB u otra base, normalizada al vocabulario de GameZone | La clasificación es editorial y puede diferir; un tag no confirma una función técnica. |
| Capturas, portada y tráiler | Recursos oficiales o medios disponibles bajo las condiciones del proveedor | Guardar procedencia y revisar el uso; no importar banners o publicidad como capturas. |
| Precio, oferta y disponibilidad | Tienda correspondiente y momento de consulta | No dejar una promoción como vigente por aparecer en un artículo antiguo. La automatización de ofertas es una ampliación independiente. |
| Versión, peso y formato del archivo enlazado | Publicación de origen, revisión y, si existe, evidencia de esa distribución concreta | La tienda oficial no verifica un archivo externo. El espacio de instalación tampoco es el tamaño de una descarga. |
| Puntuación externa | Proveedor identificado, escala, fecha y condiciones de uso | No sustituir Metacritic por la media de otra base con la misma etiqueta. Mantener separada la nota de la comunidad GameZone. |

No se elegirá un dato por mayoría de páginas: varios agregadores pueden repetir una misma fuente. Ante una discrepancia se atenderá a identidad, plataforma, edición, fecha de consulta y autoridad de la referencia para ese campo.

## Cómo lo utilizará el importador

1. Extraer la propuesta de PiviGames y buscar referencias de tienda o identificadores ya conocidos.
2. Resolver el juego y su edición. Si aparecen varios candidatos, pedir al editor que seleccione el correcto antes de completar campos.
3. Consultar los conectores configurados para los campos ausentes o dudosos. Las referencias oficiales podrán añadirse y revisarse manualmente cuando no exista un acceso automatizado documentado y habilitado.
4. Mostrar una comparación por campo con valor propuesto, fuente, fecha, plataforma/edición y estado: **documentado**, **pendiente** o **discrepancia**. «Documentado» indica que existe una referencia compatible, no que GameZone haya probado el juego.
5. Permitir aceptar una propuesta, conservar el valor editorial o completar el campo. La nueva información no se publica sin revisión ni sustituye silenciosamente una corrección manual.
6. Mantener el dato publicado si una API falla o limita el acceso. Avisar del fallo y permitir continuar con la revisión manual.

Cada propuesta conservará proveedor, URL o ID, fecha de consulta, valor de origen, valor normalizado y contexto relevante —edición, plataforma, región, idioma o tipo de lanzamiento—. La decisión editorial añadirá quién la aceptó y cuándo. Las notas de versión del juego oficial y las del archivo enlazado tendrán procedencias separadas.

Los clientes externos funcionarán en servidor con endpoints permitidos, credenciales privadas, límites, caché conforme a las condiciones de cada proveedor y reintentos acotados. La ampliación a otras fuentes no convierte el importador en un navegador abierto a cualquier URL del editor. Cada adaptador definirá sus hosts y recursos permitidos.

## Alcance inicial y validación

El panel inicial incluirá referencias por campo, selección del juego correcto y comparación de datos. El primer conector de metadatos propuesto es IGDB, condicionado a su configuración y uso autorizado; mientras tanto, el recorrido de publicación seguirá admitiendo datos contrastados manualmente en fuentes oficiales. RAWG y Wikidata podrán añadirse si resuelven necesidades concretas de cobertura.

No se basará el funcionamiento del panel en un endpoint no documentado de Steam. Sus interfaces documentadas y las páginas públicas tienen alcances distintos; la comprobación detallada está en la nota de fuentes oficiales. Tampoco se presupone que todos los juegos tengan requisitos, idiomas o imágenes completos en un agregador.

Las pruebas incluirán una coincidencia exacta por ID, títulos ambiguos, ediciones distintas, fechas de artículo frente a lanzamiento, requisitos de varios sistemas operativos, idiomas sin audio, tamaño de archivo frente a espacio instalado, notas de diferentes proveedores, respuestas incompletas y APIs no configuradas o temporalmente caídas. Reimportar debe conservar las decisiones editoriales y la relación con biblioteca y reseñas.

Para aceptar el piloto se completará una ficha real con datos de PiviGames y referencias complementarias, registrando qué fuente respalda cada campo. Se verificará que las discrepancias siguen visibles y que los datos no encontrados permanecen pendientes. Aún no se han ejecutado estas pruebas de producto: requieren la implementación del importador.
