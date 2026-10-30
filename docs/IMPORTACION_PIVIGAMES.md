# Importación de PiviGames y panel de administración

Requisito confirmado el 30 de octubre de 2026: el propietario obtiene los juegos de `https://pivigames.blog` y quiere crear publicaciones de GameZone importando un enlace, completar los datos ambiguos con otras fuentes, revisarlas y publicarlas desde un panel conectado al resto de la web. Este documento define el alcance completo; el primer recorrido React e importador ya está implementado en local. El [Estado de implementación](ESTADO_IMPLEMENTACION.md) distingue lo disponible de funciones pendientes como el historial completo recuperable y el acceso web de producción.

## Flujo del editor

1. Abrir `/admin/juegos` y elegir **Importar desde PiviGames** o **Crear manualmente**.
2. Pegar la URL de una publicación. El servidor valida la dirección y consulta su contenido público.
3. Obtener una propuesta de campos, con origen, elementos detectados y avisos. Si el enlace ya está asociado a un juego, abrir una propuesta de actualización de esa ficha. Resolver su identidad y edición antes de buscar datos complementarios.
4. Completar o contrastar los campos ausentes o dudosos mediante los conectores configurados y referencias oficiales. Revisar contenido, ficha técnica, requisitos, multimedia, versiones y enlaces en el mismo formulario utilizado para creación manual, con su procedencia y discrepancias.
5. Ver una vista previa con los componentes reales de GameZone, tanto en móvil como en escritorio.
6. Guardar el borrador o publicar. La ficha publicada alimenta catálogo, buscador, destacados y las referencias de biblioteca y comunidad.

Pegar una URL nunca publica directamente. Editar una ficha publicada prepara una nueva revisión; la versión pública permanece disponible hasta aprobar el cambio. Un fallo de importación conserva el trabajo editorial existente y ofrece reintento o creación manual.

## Pantallas del panel inicial

| Pantalla | Funciones |
| --- | --- |
| Juegos | Búsqueda, filtros por estado, procedencia y fecha de revisión; crear, importar, editar y retirar. |
| Importación | URL, resultado de extracción, juego/edición coincidente, propuestas de fuentes complementarias, avisos de datos incompletos, posible duplicado y comparación de cambios. |
| Editor de ficha | Campos estructurados y bloques de texto/listas; selector de géneros, medios y versiones; guardado de borrador. |
| Vista previa e historial | Apariencia pública, revisión actual, autor y fecha de cambios; restaurar una revisión como nuevo borrador. |
| Noticias | Crear, revisar y publicar noticias; asociarlas a juegos existentes. El importador inicial de PiviGames se centra en fichas de juegos. |
| Moderación | Reseñas y reportes, con las capacidades del rol correspondiente. |
| Configuración | Permisos y fuentes permitidas, accesibles a administradores. |

Los borradores, importaciones y errores no serán públicos ni indexables. El editor no necesitará manipular archivos HTML, SQL ni secretos.

## Obtención y conversión

La investigación ha verificado WordPress REST y publicaciones públicas de PiviGames. El primer adaptador usará esa interfaz cuando permita resolver la URL solicitada a una publicación. La identidad será el dominio y el identificador de publicación, contrastando su enlace canónico. Las rutas del sitio no se supondrán idénticas a los slugs de WordPress.

El contenido devuelto por WordPress sigue siendo HTML y necesitará interpretación. El adaptador localizará el contenido principal y lo convertirá a datos del modelo de GameZone, sin ejecutar scripts ni incorporar estilos, publicidad, comentarios ajenos o widgets de la fuente. No se utilizará `excerpt.rendered` directamente como resumen: en una ficha examinada incluye gran parte del contenido y elementos ajenos al resumen.

Si REST no permite obtener la publicación, podrá añadirse extracción de HTML público con sus propias pruebas. No se resolverán barreras de acceso mediante técnicas de evasión. Una respuesta bloqueada, incompatible o incompleta se distinguirá de una ficha vacía y permitirá edición manual. El RSS puede servir para descubrir novedades en una fase posterior; no sustituye a una ficha completa.

La documentación técnica y las URLs verificadas se recogen en [Investigación de PiviGames](INVESTIGACION_PIVIGAMES.md). La transformación del formato será determinista; no necesita un proveedor de IA para reconstruir cada publicación. Los resúmenes o descripciones propios podrán redactarse en el editor.

## Fuentes complementarias y discrepancias

El enriquecimiento buscará respaldo para los datos que PiviGames no permita identificar con claridad. La prioridad y capacidades están documentadas en [Fuentes para completar y contrastar fichas](FUENTES_DATOS_JUEGOS.md): tienda o desarrollador para datos técnicos; IGDB como candidato principal a metadatos automáticos; RAWG y Wikidata como apoyos según cobertura y condiciones.

La coincidencia utilizará identificadores de tienda cuando existan, contrastando tipo de producto, plataforma y edición. Si solo hay un nombre parecido, el editor elegirá entre candidatos antes de añadir datos. Las propuestas incluirán fuente, fecha y contexto del campo, y mostrarán estados documentado, pendiente o discrepancia. Ninguna corrección editorial se sobrescribirá automáticamente.

La revisión oficial de un juego no verifica un paquete externo. Requisitos y espacio instalado no sustituyen al tamaño de descarga; las notas de un parche oficial no demuestran qué versión contiene el enlace de PiviGames. Una promoción o un dato de consola tampoco se trasladará sin revisión a la ficha de PC.

## Campos de la ficha

| Origen o bloque | Destino en GameZone | Regla de revisión |
| --- | --- | --- |
| Título de publicación | Título del juego y slug propuesto | Separar idioma, versión o etiquetas promocionales del nombre cuando se pueda identificar con claridad; confirmar el resultado. |
| ID, URL y fechas de WordPress | Procedencia e importación | Las fechas del artículo no son la fecha de lanzamiento del juego. |
| Imagen principal y capturas | Hero, portada y galería ordenada | Revisar imagen, uso y texto alternativo; no copiar automáticamente toda imagen del artículo. |
| Descripción | Resumen y bloques editoriales | Conservar estructura útil; retirar publicidad y revisar la reutilización de texto. |
| Géneros y categorías | Géneros y plataformas de GameZone | Usar vocabularios propios; las categorías de PiviGames pueden mezclar géneros y requisitos. |
| Desarrollador, editor y lanzamiento | Datos del juego | Buscar respaldo en fuentes complementarias; dejar pendientes si no se resuelven. Admitir fechas con precisión parcial, sin inventar día o mes. |
| Idiomas | Idiomas del juego o de la versión disponible | Distinguir ambos niveles si la fuente describe una distribución concreta. |
| Requisitos mínimos/recomendados | Grupos por plataforma, sistema operativo y edición, con CPU, RAM, GPU, DirectX, disco y notas | Conservar el ámbito de versión si la fuente lo especifica. No mezclar Windows con Linux ni confundir peso de descarga y espacio de instalación. |
| Tamaño, formato y versión | Una distribución de origen vinculada al juego | Mantener versión como texto; distinguir juego base, actualización y contenido adicional. No sustituirla por una versión oficial observada en otra fuente. |
| Enlaces | Enlaces asociados a juego o versión, proveedor, tipo, etiqueta y procedencia | Validar formato sin visitar descargas; conservar componentes necesarios de la URL. |
| Instalación | Grupos de pasos y notas por versión | Revisar las instrucciones antes de publicarlas; no ejecutarlas en la importación. |
| Tráiler | Proveedor e identificador de vídeo | Reproducir mediante un componente propio, sin importar un iframe arbitrario. |
| Puntuación externa | Proveedor, valor, escala, URL y fecha de comprobación | Dejarla vacía si no hay dato verificable. La nota de usuarios y el Hall of Fame son independientes. |

La plantilla actual pide Metacritic en escala 0–10, mientras fichas como PEAK y RDR2 muestran valores de escala 0–100. El modelo nuevo guardará la escala explícitamente. Son referencias del repositorio: [plantilla](../plantilla-juego.md), [PEAK](../games/peak/peak.html) y [RDR2](../games/red-dead-redemption-2/red-dead-redemption-2.html).

La ausencia de un campo se mostrará como **pendiente**, nunca como una afirmación inventada. Para publicar serán necesarios título, slug único, resumen editorial, portada con su alternativa de accesibilidad, clasificación y revisión de enlaces y procedencia. Los requisitos, enlaces o datos técnicos que sigan ausentes se ocultarán o indicarán como no disponibles según el bloque; no se publicarán placeholders como si fueran datos reales.

## Datos, duplicados y actualizaciones

- `games`: identidad estable y revisión pública actual. Biblioteca, reseñas, listas y noticias relacionadas usan su `game_id`, no una URL externa o la versión.
- `game_distributions` y `game_links`: distribuciones de origen y sus enlaces, con versión declarada, formato y tamaño. No representan la fecha de lanzamiento ni las versiones oficiales del juego. Actualizar una distribución no crea otro juego ni elimina sus reseñas; una noticia de un parche oficial no cambia su versión declarada.
- `source_entries`: proveedor, ID de publicación, URL solicitada/canónica y asociación al juego. Restricción única por proveedor e ID; URL normalizada como señal adicional.
- Identificadores externos y propuestas de campo: relaciones con las referencias de tienda o agregador ya confirmadas y observaciones con proveedor, valor original/normalizado, fecha y ámbito. Pueden formar parte de la revisión sin multiplicar las fuentes de datos públicas del catálogo.
- `imports`: fecha, actor, versión del extractor, huella del contenido relevante, resultado, avisos y errores. Se guardan campos estructurados y la trazabilidad necesaria, evitando conservar publicidad o comentarios de terceros.
- `game_revisions`: borradores y revisiones publicadas, con autor, diferencias y procedencia por campo o bloque. Los cambios editoriales y los datos obtenidos de la fuente permanecen distinguibles.

Reimportar compara **lo importado anteriormente**, **la edición actual de GameZone** y **la nueva propuesta**. El editor decide qué cambios acepta. Las ediciones manuales se conservan y los conflictos se señalan. Que un enlace o imagen deje de aparecer en la fuente no implica borrarlo automáticamente.

El mismo ID de fuente genera una actualización propuesta. Un título parecido o una referencia Steam coincidente genera un aviso para revisar; no fusiona automáticamente ediciones diferentes. Las importaciones repetidas sin cambios no crean nuevas fichas. Los enlaces firmados o con fragmentos se conservarán completos; normalizar una URL no debe eliminar sus tokens.

Publicar selecciona una revisión válida mediante una escritura atómica y control de concurrencia. Después se actualizan las cachés de detalle, catálogo y búsqueda; una invalidación fallida se registra y reintenta. Los datos personales y borradores no entran en cachés públicas. Retirar una publicación la oculta, conservando sus referencias personales y el historial conforme a la política de datos.

## Permisos y límites de la importación

Solo editores y administradores podrán importar y publicar. Moderar la comunidad no concede permisos editoriales, y un miembro no puede iniciar consultas a la fuente ni cambiar estados de publicación. Las comprobaciones estarán en servidor y en las políticas de base de datos.

El adaptador de publicaciones limitará sus consultas a HTTPS y al dominio confirmado `pivigames.blog`, con endpoints REST construidos en servidor. Los adaptadores de metadatos tendrán endpoints fijos y reglas propias, credenciales privadas, cuotas y caché conforme al proveedor. Las referencias a webs oficiales se podrán contrastar manualmente; no se habilitará por ello la consulta automática de cualquier URL. Variantes de host y destinos de medios necesitarán una configuración explícita, sin aceptar dominios parecidos por coincidencia de texto.

Se rechazarán credenciales en la URL, puertos arbitrarios, direcciones locales, privadas o reservadas y redirecciones a destinos no admitidos. La resolución DNS y la conexión deben proteger frente a cambios de dirección entre la validación y la consulta. Se limitarán duración, tamaño de respuesta descomprimida, frecuencia y concurrencia. Obtener imágenes desde servidor requerirá controles equivalentes.

El importador leerá la publicación y tratará sus enlaces como datos: no seguirá acortadores, abrirá instaladores ni descargará archivos de los juegos. Los bloques importados y la vista previa no ejecutarán HTML remoto; los enlaces rechazarán esquemas como `javascript:` y `data:`. Las reglas aplicables de acceso a la fuente y la procedencia de textos, medios y enlaces se revisarán antes de activar la integración en producción; una API pública no acredita por sí sola autorización de reutilización.

Para el volumen inicial bastará una operación de servidor acotada por URL y un registro persistente de su resultado. Importación masiva, colas de procesos y sincronización programada se incorporarán solo cuando el volumen lo justifique. No habrá publicación o sobrescritura automática de cambios de PiviGames.

## Pruebas para darlo por terminado

1. Importar dos publicaciones representativas accesibles y comprobar los campos contra la fuente, incluyendo una con versiones o actualizaciones. Si no se consigue una muestra de ese tipo, esa cobertura se declara pendiente y se prueba además con un ejemplo sintético.
2. Guardar un borrador, recargar el panel y confirmar que sigue editable y no aparece en ninguna ruta pública.
3. Publicar y comprobar la misma ficha en detalle, catálogo y búsqueda; un usuario puede guardarla y reseñarla.
4. Modificar manualmente un campo, reimportar y comprobar que se conserva y que el editor puede aceptar otros cambios de la fuente.
5. Reimportar la misma publicación sin cambios: no se duplica el juego, su versión o sus enlaces; se conservan biblioteca y reseñas.
6. Probar extracción parcial, promoción que no es una ficha, 404, bloqueo remoto, límite de frecuencia y timeout. Todos producen un resultado explícito sin alterar lo publicado.
7. Intentar importar desde una cuenta sin permisos y probar URLs privadas, redirecciones no permitidas y contenido con scripts. La solicitud se rechaza o el contenido se convierte en datos inocuos.
8. Simular una edición concurrente y un fallo al guardar o actualizar cachés; verificar que no se pierden cambios y que se puede recuperar la revisión anterior.
9. Completar datos desde una fuente complementaria; probar títulos ambiguos, ediciones y plataformas distintas, discrepancias, APIs sin configurar o caídas. Confirmar que una observación del juego oficial no sustituye los datos del archivo de origen y que la edición manual conserva su procedencia.

El adaptador tendrá pruebas repetibles con ejemplos mínimos saneados para detectar cambios de estructura sin depender de la disponibilidad diaria de PiviGames. La validación contra páginas reales será una comprobación de integración separada. Este documento y la investigación establecen el alcance; esas pruebas deberán ejecutarse sobre la implementación antes de declararla funcional.
