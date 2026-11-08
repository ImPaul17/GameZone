# Plan de mejora de GameZone

Fecha: 30 de octubre de 2026. Base revisada: `main`, commit `0c59186cc1abfbd9d10df42007e17def3d02e2db` del 25 de septiembre de 2025.

Actualización de ejecución, 2 de noviembre: alojamiento Netlify Free y Supabase Free configurados; web disponible en `https://gamezone-impaul17.netlify.app`, con Discord y sesión editorial comprobados por el propietario. Los detalles vigentes de publicación y verificaciones están en [Despliegue](DESPLIEGUE.md) y [Estado de implementación](ESTADO_IMPLEMENTACION.md); las secciones siguientes conservan el plan y la auditoría de partida.

El objetivo es mejorar las bases y las funciones de GameZone para su publicación, conservando literalmente la web pública actual: aspecto, HTML, CSS, estructura y rutas `.html`. React se utiliza en un panel de administración separado y Next.js aporta el servidor y las integraciones. Las cuentas y la comunidad siguen dentro del plan.

**Restricción expresa del propietario: no rediseñar la web pública.** Cualquier cambio visual futuro deberá ser solicitado expresamente. La modernización de datos, seguridad y publicación se integra en las páginas originales.

Este documento define el alcance de la modernización. Ya están implementados el panel React, catálogo estructurado, importación revisable y persistencia, conectados a un renderizador de los HTML públicos originales. Se han añadido el editor de noticias y las cuentas con Discord, alias, biografía y foto privada. Las fichas nuevas usan la plantilla original de PEAK; las noticias reutilizan los estilos originales y las vistas previas no ejecutan scripts. Los límites y la verificación de proveedores figuran en [Estado de implementación](ESTADO_IMPLEMENTACION.md). Las funciones restantes del plan no se consideran terminadas. Las aclaraciones del propietario incorporan expresamente cuentas, comunidad y un panel de administración con importación de publicaciones desde enlaces de `pivigames.blog`, completando datos ambiguos mediante fuentes complementarias. El dominio fue confirmado por el propietario, corrigiendo la referencia inicial a «PibiGames».

## 1. Punto de partida

En el commit de partida, el repositorio contenía 17 páginas HTML y nueve fichas de juegos, sin `package.json`, herramientas de compilación, pruebas ni configuración de integración continua rastreados. Los hallazgos siguientes describen esa base histórica; no sustituyen el estado actual de implementación.

| Prioridad | Situación comprobada | Referencia en la versión revisada | Acción |
| --- | --- | --- | --- |
| Inmediata | El parámetro `q` del buscador llega sin escapar a `innerHTML` al mostrar cero resultados: vía de DOM XSS identificada por análisis estático. | `buscar.html:1539–1547`, `1630–1636` | Corrección incorporada al buscador original sin cambios visuales; comprobarla también en el despliegue. |
| Antes del lanzamiento | La suscripción comunica éxito, pero guarda nombre y correo en el navegador; el envío EmailJS está comentado. | `index.html:1949–2018` | Sustituirla por un alta persistente y confirmada con un proveedor de correo. |
| Antes del lanzamiento | Las fichas enlazan descargas externas; no se ha localizado documentación que acredite permisos de distribución. | `games/peak/peak.html:2040–2044`, `plantilla-juego.md` | Inventariar origen y autorización de los enlaces que se vayan a publicar. |
| Alta | Cabecera, pie, estilos y scripts se repiten en muchas páginas. El catálogo también se copia varias veces dentro del buscador. | `index.html:19–1200`, `buscar.html:1090`, `1240`, `1330` | Una fuente de datos publicada y un renderizador sobre las plantillas HTML originales, conservando su estructura y CSS. |
| Alta | Hay datos que divergen entre búsqueda y ficha: por ejemplo, el año de PEAK. | `buscar.html:1163–1164`, `games/peak/peak.html:1709` | Importación revisada, fuentes y fecha de comprobación por ficha. |
| Alta | La navegación se oculta en móvil y aparece un botón para el que no se ha localizado manejador de apertura. | `index.html:912–919`, `1312–1314` | Verificar el comportamiento original y proponer correcciones funcionales sin rediseñar; cualquier cambio visual requiere petición expresa. |
| Alta | Noticias sigue en «próximamente»; la portada sitúa promociones afiliadas bajo «Noticias Gaming». | `noticias.html:1028–1043`, `index.html:1354–1407` | Publicación editorial real y promociones identificadas. |
| Alta | No se localizaron description, canonical, Open Graph, datos estructurados, sitemap o robots. Varias referencias a favicons y manifest no tienen archivo local. | Cabeceras HTML; `index.html:10–13`; árbol Git | Metadatos por ruta, recursos completos y estrategia de indexación. |
| Media | «Acerca de» promete servidores propios y archivos escaneados, mientras DMCA describe un índice de terceros sin garantías de integridad. | `about.html:1124–1130`, `dmca.html:807–813` | Corregir afirmaciones con información comprobable. |

Estos hallazgos procedían de los archivos, sin ejecutar ataques ni descargar los juegos enlazados. La revisión inicial debía completarse con comprobaciones en navegador, rendimiento, cabeceras del alojamiento y accesibilidad práctica; el alcance actual se recoge en el estado de implementación.

## 2. La experiencia que vamos a construir

Visitar GameZone, buscar juegos, leer noticias, consultar las fichas y acceder a los enlaces de descarga publicados seguirá siendo público y sin registro. La cuenta añadirá funciones personales y participación.

**Mi GameZone** será el sistema central: guardar un título como «quiero jugar», «jugando», «completado» o «dejado», organizar listas y compartir las que el usuario elija. La biblioteca empezará siendo privada. Una lista pública tendrá su propio enlace y podrá descubrirse desde la comunidad.

La primera comunidad vivirá alrededor del contenido existente:

- Perfil con alias, avatar de una selección inicial y biografía breve; correo siempre privado.
- Biblioteca sincronizada entre dispositivos y listas privadas o públicas por elección del propietario.
- Una reseña editable por cuenta y juego, con puntuación y marca de spoilers. La media de usuarios se distinguirá de cualquier nota editorial o externa y mostrará cuántas valoraciones tiene.
- Espacio de comunidad con listas públicas y reseñas recientes; estados vacíos honestos mientras llegan usuarios.
- Moderación disponible desde la apertura: reportes, ocultación, suspensión de cuentas y registro de decisiones.

El criterio práctico será completar este recorrido: una persona entra desde una ficha, crea su cuenta, guarda el juego, vuelve desde otro dispositivo, publica una reseña y comparte una lista. Otra persona puede verla y reportar un aporte; un moderador puede resolver el reporte.

La siguiente entrega añadirá comentarios en fichas y noticias, con edición o retirada de los propios aportes, spoilers y reportes, y un panel de actividad de los juegos guardados. Después podrán llegar recomendaciones por géneros elegidos. Los retos de comunidad o insignias serían una ampliación posterior; los estados de juego declarados por el usuario no demostrarán logros o partidas verificadas.

El minijuego Snake y su acceso mediante la secuencia Konami también forman parte de lo que se conservará, aislados de la carga inicial de las fichas.

## 3. Base técnica recomendada

| Parte | Elección propuesta | Motivo para GameZone |
| --- | --- | --- |
| Web y administración | React, Next.js App Router y TypeScript | React para el panel separado; Next.js sirve el HTML público original y las API de datos e integraciones. |
| Estilos | CSS original de la web pública y estilos separados del panel | Mantener literalmente la apariencia pública; evitar que el diseño del administrador altere las páginas originales. |
| Datos y cuentas | Supabase: PostgreSQL y Auth | Una base relacional para catálogo, noticias, bibliotecas y comunidad, con autenticación gestionada. |
| Acceso | Discord y acceso por código de correo | Aprovechar la comunidad existente y ofrecer una alternativa sin Discord. El correo de acceso necesitará un remitente de producción configurado. |
| Contenido | Panel de administración con editor e importador de PiviGames | Crear publicaciones manualmente o desde un enlace, revisar su conversión al formato GameZone y publicar sin editar HTML. |
| Búsqueda | Índice generado desde el catálogo publicado | El volumen actual permite búsqueda ligera con filtros, sin contratar otro servicio. Revisar esta decisión con datos de uso y tamaño del índice. |
| Alojamiento | Next.js en un entorno con servidor; Vercel como candidato | Soportar sesiones, escrituras e integraciones en el mismo proyecto. Dominio, proveedor y plan quedan por decidir. |

El renderizador de servidor actualiza contenido y tarjetas dentro de las plantillas locales originales; el buscador mantiene su presentación y recibe el catálogo publicado. Las interacciones React corresponden al panel de administración. Esta separación mantiene la web pública existente y permite ampliar la lógica de servidor. [Documentación de Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components).

Las cuentas usarían las integraciones de Auth y Discord de Supabase. Los permisos se comprobarían tanto en las operaciones de servidor como mediante políticas de acceso a las tablas. Las claves administrativas quedarían exclusivamente en servidor. [Discord en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord), [seguridad por filas](https://supabase.com/docs/guides/database/postgres/row-level-security).

No usaría GitHub Pages como alojamiento único de esta arquitectura: una exportación estática limita funciones como cookies, acciones de servidor y redirecciones. El repositorio seguiría en GitHub. Si se mantiene monetización, el plan de alojamiento deberá permitir uso comercial; Vercel Hobby está restringido a uso personal no comercial. [Exportación estática de Next.js](https://nextjs.org/docs/app/guides/static-exports), [condiciones de Vercel Hobby](https://vercel.com/docs/plans/hobby).

Organización propuesta:

```text
src/app/                  administración, API y servicio de las rutas públicas originales
src/components/           componentes del panel de administración
src/modules/legacy/       renderizador de las plantillas HTML públicas originales
src/modules/catalog/      consultas, búsqueda y reglas del catálogo
src/modules/editorial/    noticias y publicación
src/modules/imports/      importación PiviGames, extracción y comparación de revisiones
src/modules/accounts/     sesiones y perfiles
src/modules/library/      biblioteca y listas
src/modules/community/    reseñas, comentarios y moderación
src/lib/integrations/     clientes externos usados realmente
supabase/migrations/      esquema y permisos versionados
scripts/                  importación y comprobación del contenido
tests/                    recorridos y permisos críticos
```

Cada módulo concentrará sus reglas detrás de una interfaz pequeña. No introduciría un backend Express separado ni una arquitectura de microservicios para este alcance.

**Datos mínimos:** juegos, distribuciones de origen, géneros, plataformas, medios, enlaces, noticias y autores; perfiles públicos separados de los datos privados de autenticación; entradas de biblioteca, listas, elementos de lista, reseñas, comentarios, reportes y acciones de moderación. Restricciones en base de datos impedirán duplicar una reseña o entrada de biblioteca del mismo usuario para el mismo juego. Los enlaces tendrán tipo, origen, estado y fecha de revisión. Las importaciones guardarán procedencia, identificador de la publicación, campos extraídos, advertencias e historial de cambios, separados de la ficha publicada. Las versiones declaradas de archivos externos no se confundirán con los lanzamientos o parches oficiales.

**Publicación desde PiviGames:** pegar enlace → consultar la publicación desde servidor → identificar el juego y detectar si ya existe → proponer campos estructurados → completar o contrastar datos con fuentes complementarias → revisar en el editor y vista previa de GameZone → guardar borrador o publicar. La conversión usa las plantillas HTML originales de GameZone; los juegos nuevos parten de la ficha original de PEAK. La vista previa se muestra en un iframe sin scripts. No se inserta el HTML de PiviGames. Reimportar propone diferencias y conserva los cambios manuales y el identificador del juego, del que dependen biblioteca, reseñas y listas.

Las fuentes se elegirán por campo: tienda o desarrollador para requisitos, idiomas y lanzamiento de la edición; IGDB como candidato principal a metadatos automáticos; RAWG o Wikidata como alternativas de cobertura. Cada propuesta conservará origen, fecha y ámbito. Un conflicto quedará visible para el editor. Los datos de la edición oficial no se usarán para certificar la versión o el tamaño del archivo enlazado en PiviGames. La [investigación y prioridad de fuentes](FUENTES_DATOS_JUEGOS.md) define las capacidades comprobadas y sus condiciones.

El panel incluirá listado de juegos y estados, creación manual, importación por enlace, edición, vista previa, publicación/retirada e historial, además de noticias y moderación. Los detalles del flujo, campos, permisos y pruebas quedan definidos en [Importación de PiviGames y panel de administración](IMPORTACION_PIVIGAMES.md).

## 4. Integraciones con una función concreta

| Integración | Uso | Condición de incorporación |
| --- | --- | --- |
| Supabase Auth y Discord | Registro, sesiones, perfiles y participación | Necesaria para cuentas; permisos probados antes de abrirlas. |
| PiviGames | Fuente principal declarada por el propietario para importar publicaciones mediante URL | Importación editorial como borrador, revisión de campos y procedencia; nunca publicación automática al pegar el enlace. |
| Tiendas y desarrolladores oficiales | Referencias para aclarar identidad, requisitos, idiomas y lanzamiento por edición/plataforma | Contraste manual inicial; automatización solo mediante vías documentadas y habilitadas para el uso previsto. |
| IGDB | Ayudar a importar desarrolladores, plataformas, lanzamientos y medios | Consultas desde servidor, caché y revisión editorial. Un fallo externo no debe dejar vacía una ficha ya publicada. |
| Resend | Correo transaccional de acceso; newsletter como ampliación independiente | Dominio remitente verificado y errores controlados para cuentas. La newsletter requiere además alta confirmada y baja. |
| Discord existente | Acceso a la comunidad y canal de conversación | Mantener el enlace. Un bot o publicaciones automáticas no son necesarios para el estreno. |
| Tráilers de YouTube | Multimedia de las fichas | Cargar el reproductor cuando se solicite y revisar su tratamiento de privacidad. |
| Plausible | Saber qué fichas se consultan y qué recorridos se usan | Presupuesto y configuración revisados; eventos sin correos, alias ni texto libre de comentarios o búsquedas. |

IGDB requiere credenciales de aplicación; su documentación distingue el uso no comercial de las asociaciones para proyectos monetizados. GameZone ya contiene afiliación, por lo que esa condición debe resolverse antes de integrarlo. Los nueve juegos pueden importarse y revisarse manualmente sin depender de esta aprobación. Los permisos sobre textos e imágenes se comprobarán según su fuente. [Documentación de IGDB](https://api-docs.igdb.com/).

Supabase necesita SMTP propio para enviar acceso por email a destinatarios externos; Resend es uno de los proveedores compatibles. El lanzamiento actual utiliza Discord para las cuentas públicas y reserva el correo predeterminado para el propietario editorial. [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Resend ofrece correo y gestión de contactos, pero la confirmación de alta y el estado de suscripción deben implementarse de forma coherente en GameZone; crear un contacto no prueba por sí solo que haya confirmado. Registrar una cuenta tampoco suscribirá automáticamente a la newsletter. [Contactos de Resend](https://resend.com/docs/api-reference/contacts/create-contact). Para las métricas, [Plausible documenta estadísticas y eventos](https://plausible.io/docs).

La integración de PiviGames pertenece al panel editorial inicial. Se ha comprobado que el sitio expone publicaciones mediante WordPress REST; el contrato específico y las limitaciones están en la [investigación de la fuente](INVESTIGACION_PIVIGAMES.md). Si una publicación no es accesible o no se interpreta con fiabilidad, el panel permitirá completar la ficha manualmente e indicará el fallo de importación.

La fase editorial inicial incluirá contraste de fuentes y el diseño del conector de enriquecimiento. IGDB es el primer proveedor propuesto para automatizarlo cuando estén resueltas su configuración y condiciones; las referencias oficiales podrán revisarse manualmente. RAWG queda condicionado a aclarar la discrepancia entre sus planes y condiciones comerciales, y Wikidata servirá de apoyo si mejora el emparejamiento. Newsletter y analítica seguirán siendo opcionales, con la captura de suscripciones desactivada hasta que su flujo completo funcione.

Los precios y cuotas de producción se comprobarán al elegir proveedores. El presupuesto incluirá dominio, alojamiento, base de datos y copias, envío de correos y analítica, con avisos de consumo. No se da por hecho que los planes gratuitos cubran el lanzamiento.

## 5. Orden de trabajo y entregables

| Fase | Trabajo | Se considera terminada cuando… |
| --- | --- | --- |
| 0. Preparar la modernización | Corregir el buscador sin cambios visuales; conservar los HTML y CSS activos, inventariar las nueve fichas, enlaces y recursos; resolver el tratamiento de descargas y textos de confianza. | El parche tiene una prueba reproducible y un procedimiento para verificar su despliegue; las URLs originales siguen sirviéndose y el contenido pendiente de revisión está identificado. |
| 1. Crear el panel React y el servidor | Next.js, TypeScript, panel separado, renderizador de los HTML originales, configuración de entorno y scripts reproducibles. | Una ficha piloto funciona con datos estructurados dentro de la plantilla original y su ruta `.html`; instalación, comprobación de tipos y build pasan desde un clon limpio. |
| 2. Conectar catálogo y edición de noticias | Base de datos, migraciones, importación de las nueve fichas y conexión de catálogo, buscador, portada y Hall of Fame originales; conservar Snake con acceso Konami. Panel con creación manual, importación PiviGames por URL, contraste de fuentes, revisión, vista previa, publicación e historial; después, editor de noticias. | Un editor puede importar un enlace real, completar el borrador con referencias complementarias y publicarlo sin tocar HTML; ve discrepancias y procedencia; volver a importarlo no duplica el juego ni borra ediciones; los cambios aparecen en las páginas originales. También puede publicar una noticia y siguen funcionando los accesos actuales. |
| 3. Añadir cuentas y Mi GameZone | Acceso, cierre de sesión, perfil, biblioteca, listas, privacidad y eliminación de cuenta. | Dos cuentas y un visitante superan pruebas de aislamiento de datos; la biblioteca persiste entre sesiones y dispositivos. |
| 4. Abrir la comunidad | Reseñas, puntuaciones, spoilers, listas públicas, reportes y herramientas de moderación. | Funciona el recorrido social completo y un usuario normal no puede ejecutar acciones de editor, moderador o administrador. |
| 5. Preparar el lanzamiento | Correo transaccional real, SEO, pruebas de navegador, accesibilidad, rendimiento, copias, observación de errores y despliegue de prueba. | Se cumplen los criterios de publicación y se ensaya restauración y vuelta a la versión anterior; las integraciones opcionales que no estén listas permanecen desactivadas. |
| 6. Ampliar tras el estreno | Comentarios y panel de actividad; newsletter confirmada, otros conectores o sincronizaciones de fuentes y analítica según presupuesto y condiciones. | Cada ampliación completa su recorrido, permisos, moderación o tratamiento de errores antes de activarse. |

Las fases se desarrollarán en ramas y entornos de prueba, manteniendo la web publicada durante la migración. El primer lanzamiento con comunidad incluirá las fases 0 a 5. Una apertura anterior del catálogo sería una entrega parcial, con su alcance explícito.

La primera entrega conecta el parche del buscador, Next.js y el panel editorial a la web original. El recorrido piloto es enlace PiviGames → borrador en administración → contraste con fuentes complementarias → revisión en el formato original → publicación → listado, búsqueda y ficha `.html`. El trabajo pendiente y sus límites se mantienen en [Estado de implementación](ESTADO_IMPLEMENTACION.md); no se sustituye la web pública por una aplicación con otro diseño.

## 6. Condiciones para publicar

- **Permisos:** visitante, miembro, editor, moderador y administrador con capacidades explícitas. Cada persona modifica su biblioteca y sus aportes; las listas privadas solo son visibles para su propietario. Los roles no pueden cambiarse desde el perfil. Acceso administrativo con protección adicional.
- **Cuentas:** sesiones verificadas en servidor, callbacks de acceso limitados a destinos permitidos, páginas privadas fuera de cachés compartidas y pruebas de sesión caducada. Eliminación de cuenta con una política explícita para borrar o anonimizar sus aportes y gestionar retención en copias.
- **Participación:** límites de publicación, protección frente a spam, entradas tratadas como texto o contenido saneado y reportes con responsable de revisión. Las reglas y la operación de moderación estarán disponibles desde la apertura. Mensajes privados, adjuntos y chat en directo quedan para fases posteriores.
- **Contenido y descargas:** mantener las fichas y la función de enlaces del proyecto, revisando cuáles pueden publicarse y con qué origen o autorización. Los enlaces sin respaldo quedarán pendientes de publicación. También se revisarán fuentes, puntuaciones, imágenes, tipografías y afirmaciones de seguridad. No se ha determinado la autorización de los archivos externos en esta auditoría.
- **Importador:** solo editores y administradores podrán iniciarlo. La consulta se hará desde servidor con dominio y redirecciones validados, límites de tamaño/tiempo y protección frente a destinos privados. Se importará la publicación como datos; los enlaces de descarga no se recorrerán y no se descargarán los juegos. Los errores, campos ausentes y conflictos de actualización se mostrarán antes de publicar.
- **Privacidad:** información adaptada a los datos y proveedores utilizados, preferencias de comunicación y revisión del tratamiento de cookies y reproductores. Cuando sean necesarias opciones de consentimiento, aceptar y rechazar tendrán visibilidad equivalente, conforme a la guía de la [AEPD](https://www.aepd.es/preguntas-frecuentes/17-internet-y-redes-sociales/FAQ-1707-importancia-de-las-cookies-en-la-proteccion-de-datos).
- **Calidad de uso:** navegación completa a 360, 768 y 1440 px, teclado, foco visible, formularios etiquetados, contraste y movimiento reducido. Objetivo WCAG 2.2 AA, comprobado con revisión automática y manual de los recorridos principales. [Referencia W3C](https://www.w3.org/TR/WCAG22/).
- **Rendimiento y SEO:** imágenes dimensionadas y optimizadas, contenido principal presente en el HTML, metadatos propios, sitemap, robots y páginas inexistentes con estado correcto. Objetivos de campo: LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1 en el percentil 75; antes del lanzamiento se harán pruebas de laboratorio y después se contrastarán datos reales. No hay mediciones actuales. [Umbrales de Core Web Vitals](https://web.dev/articles/defining-core-web-vitals-thresholds).
- **URLs existentes:** servir `index.html`, `games.html`, `buscar.html?q=...`, noticias, Hall of Fame, páginas informativas, `secret.html` y las fichas en sus rutas originales. Preservar consultas y categorías. Los alias nuevos redirigen hacia las URLs `.html`, no al revés. Cualquier cambio de dominio requiere comprobar qué transición permite el alojamiento anterior, sin asumir control de redirecciones HTTP externas.
- **Operación:** configuración de desarrollo y producción separada, secretos fuera de Git, registro de errores sin datos privados, copias con restauración probada y un procedimiento de reversión compatible con las migraciones de datos.

Las comprobaciones automatizadas cubrirán build, tipos y reglas críticas; las pruebas de navegador cubrirán búsqueda sin resultados, enlaces antiguos, acceso, biblioteca, importación, publicación y moderación. Las pruebas de permisos usarán al menos dos usuarios distintos y un visitante para intentar leer o modificar datos ajenos. El importador se probará con altas, reimportaciones, cambios manuales, bloqueos remotos y datos incompletos, además de URLs maliciosas y HTML no confiable. También se probarán errores de correo, caída de integraciones y contenido sin publicar. Los permisos de comentarios se comprobarán antes de habilitar esa ampliación.

## 7. Cómo evitar que vuelva a quedarse parado

El panel editorial permite crear, importar desde PiviGames, corregir, publicar y retirar contenido. Reimportar muestra las diferencias frente al último origen y la edición de GameZone, conservando la versión publicada hasta aprobar su sustitución. El panel mantiene fuentes y fechas de actualización. Cualquier incorporación visual a las fichas, promociones o Hall of Fame se propondrá por separado y requerirá petición expresa.

Después de publicar, se establecerá una rutina de revisión de enlaces y datos, atención a reportes y actualización de dependencias. Las métricas iniciales serán guardados en biblioteca, listas compartidas, participación útil, búsquedas sin resultados y antigüedad de fichas. Los objetivos numéricos se fijarán al disponer de una línea base.

La primera publicación utiliza Netlify Free y Supabase Free con el subdominio de Netlify y cuentas Discord. Quedan por concretar un dominio propio, SMTP externo, presupuesto de ampliaciones, responsable de moderación y revisión documental de los enlaces actuales. La apertura de comentarios y otras funciones de comunidad se planificará con esos responsables y controles; no se consideran incluidas en esta primera publicación.
