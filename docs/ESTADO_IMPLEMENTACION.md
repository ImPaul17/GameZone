# Estado de la primera entrega de GameZone

30 de octubre de 2026. Rama `feat/react-editorial-foundation`.

El primer recorrido implementado convierte una propuesta editorial en borrador persistente y publicación del catálogo. La web pública mantiene literalmente su aspecto original, HTML, CSS y rutas `.html`; React se utiliza en el panel de administración separado y Next.js en el servidor. El plan general sigue en desarrollo.

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
| Cuentas y comunidad | Pendientes de las siguientes fases. |
| Noticias y newsletter | `noticias.html` conserva la página original con «próximamente». Editor de noticias y correo siguen pendientes. |

Las pruebas cubren validación, persistencia, acceso, concurrencia, importación, propuestas de fuentes y recorridos en Chromium. La prueba editorial de navegador utiliza una respuesta de importación sintética y persistencia real en una base separada. Las comprobaciones reales de la fuente son independientes; una prueba local no acredita el despliegue público ni acceso a proveedores con claves.

Verificación actual: lint, TypeScript y compilación correctos; 152 pruebas de código y cuatro recorridos de navegador pasan. Los recorridos de navegador usan una base aislada y desactivan explícitamente las credenciales remotas. Se compararon, leyendo desde Supabase, las respuestas de las 16 páginas originales sin cambios de contenido con sus archivos HTML: son idénticas. La comparación de contenido tolera el orden de claves de JSONB y conserva el orden de los arrays. El buscador mantiene sus estilos y estructura visual, con los cambios de seguridad y datos necesarios para consultar el catálogo publicado. La vista previa carga también la tipografía original dentro del iframe aislado.

Bloque completado: proyecto propio de Supabase, catálogo transferido sin perder borradores ni versiones publicadas y acceso editorial real comprobado. Las claves y las copias de seguridad permanecen privadas; la base SQLite se conserva. La integración con GitHub está vinculada a `ImPaul17/GameZone`, pero los cambios de esta rama siguen en la copia de trabajo local hasta su revisión y publicación en Git. El despliegue automático de producción está desactivado.

Siguiente bloque: edición de noticias y, después, cuentas personales siguiendo el plan. El correo propio para destinatarios externos, el dominio y el despliegue público siguen pendientes. La solicitud de acceso no registra usuarios ni concede permisos editoriales. Antes de abrir al público deben resolverse las decisiones de lanzamiento del [plan](PLAN_MEJORA.md).
