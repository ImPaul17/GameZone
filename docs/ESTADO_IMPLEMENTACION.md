# Estado de implementación de GameZone

30 de octubre de 2026. Rama `feat/react-editorial-foundation`.

El recorrido editorial convierte propuestas en borradores persistentes y publicaciones de juegos y noticias. La web pública conserva su aspecto, plantillas y rutas `.html`. React se utiliza en el panel separado y en la nueva página de cuenta, que reutiliza la tipografía y los colores originales; Next.js aporta el servidor. El plan general sigue en desarrollo.

La restricción de alcance es expresa: **no rediseñar la web pública**. Cualquier cambio visual futuro debe responder a una petición del propietario.

| Área | Estado |
| --- | --- |
| React, Next.js y TypeScript | Panel editorial React separado y servidor Next.js; las páginas públicas conservan su HTML y CSS originales. |
| Catálogo y fichas | Nueve fichas migradas a una fuente estructurada, proyectada sobre las páginas originales. Nuevos juegos con la plantilla original de PEAK y rutas `/games/<slug>/<slug>.html`. Datos históricos pendientes de revisión. |
| Acceso editorial local | Contraseña privada y cookie firmada con caducidad; limitado al entorno local, con comprobación de origen. |
| Persistencia | SQLite local durable con transacciones, revisión optimista y separación borrador/publicado. |
| PiviGames | Consulta pública por URL, resolución WordPress, extracción, advertencias y comparación por campos. Dos muestras reales comprobadas sin publicar contenido. |
| Fuentes complementarias | Referencias oficiales manuales y candidatos IGDB con configuración opcional. IGDB autenticado real pendiente; no se inventan resultados sin claves. |
| Publicación | Guarda y publica en catálogo, detalle y búsqueda; permite retirada. La revisión nueva no sustituye lo publicado hasta aprobarse. |
| Vista previa | Iframe del panel con el formato de la ficha original y los datos del borrador, sin ejecución de scripts. |
| Supabase | Proyecto propio creado y vinculado a GitHub con despliegue manual. Nueve fichas transferidas y verificadas; RLS y rechazo de acceso anónimo comprobados. Acceso editorial por enlace PKCE probado en navegador con la cuenta del propietario. Código opcional, cookies HttpOnly y renovación en servidor implementados. |
| Navegación pública | Las rutas `.html` originales siguen sirviéndose; los alias nuevos redirigen a ellas. Snake conservado. El buscador corrige XSS sin cambios visuales. |
| Cuentas | Implementados acceso Discord con PKCE, sesión en servidor, perfil propio con alias y biografía, correo privado y fotos de perfil. El avatar de Discord puede sustituirse o restaurarse. Proveedor real configurado; el propietario completó el acceso y confirmó su perfil. Identidad Discord y foto verificadas en Supabase. Registrarse no concede rol editorial. |
| Fotos de perfil | Bucket privado, rutas autenticadas, validación de formatos y tamaño, normalización a WebP 256 × 256 sin metadatos y aislamiento por usuario. |
| Noticias | Editor React con listado, borradores, portada, texto, etiquetas, fuente, vista previa, publicación y retirada. Los artículos se proyectan sobre los estilos originales en portada, listado y `/noticias/<slug>.html`; sin noticias publicadas se conserva la página original. |
| Comunidad y newsletter | Bibliotecas, listas, comentarios, reportes, moderación y newsletter pendientes. |

Las pruebas cubren validación, persistencia, acceso, concurrencia, importación, propuestas de fuentes y recorridos en Chromium. La prueba editorial de navegador utiliza una respuesta de importación sintética y persistencia real en una base separada. Las comprobaciones reales de la fuente son independientes; una prueba local no acredita el despliegue público ni acceso a proveedores con claves.

Las 199 pruebas de código cubren además snapshots y concurrencia de noticias, renderizado sin scripts activos, PKCE de Discord, separación entre miembro y editor, privacidad del perfil y validación real de imágenes. Dieciocho recorridos de navegador pasan en una base aislada, con las credenciales remotas explícitamente desactivadas: catálogo, importación, noticias, cuenta de visitante, rutas y estilo de todas las pantallas. Lint, TypeScript y compilación pasan. Los HTML originales conservan sus bytes al excluir únicamente la nueva entrada de cuenta y el comportamiento de navegación móvil añadidos. Acceso, panel, editores y cuenta utilizan la paleta original negra y verde, Inter y SnesItalic. La cabecera se comprueba a 1440, 1280, 1024 y 390 px, incluyendo buscador, apertura del menú, Escape, clic exterior y vuelta a escritorio; los editores abren desde el inicio.

Supabase: catálogo transferido sin perder borradores ni versiones publicadas y acceso editorial real comprobado. Aplicadas también las migraciones de noticias y perfiles; confirmados nueve juegos, cero noticias de prueba en la base real y bucket de avatares privado. El panel real carga la sección Noticias. Tras el acceso Discord se verificaron el perfil y su foto, la identidad enlazada a la cuenta del propietario y la conservación del único rol administrador; las lecturas anónimas de perfiles y noticias se rechazan. Las claves y copias permanecen privadas y SQLite se conserva. El trabajo se publica en [GitHub](https://github.com/ImPaul17/GameZone/tree/feat/react-editorial-foundation), en esta rama. El despliegue automático de producción permanece desactivado.

La sustitución y retirada de fotos propias se validan con imágenes reales y transporte simulado en pruebas de código. También se ha comprobado en el bucket real la subida, lectura autenticada y eliminación de una imagen sintética temporal, con los mismos encabezados del servidor; no se modificó la foto personal del propietario. La credencial de Discord se introdujo directamente en el proveedor, sin pasar por el chat o Git. El correo propio para destinatarios externos, el dominio, eliminación de cuenta desde el producto y el despliegue público siguen pendientes. La solicitud de acceso editorial por correo no registra usuarios ni concede permisos; el registro Discord crea miembros sin rol editorial. Antes de abrir al público deben resolverse las decisiones de lanzamiento del [plan](PLAN_MEJORA.md).
