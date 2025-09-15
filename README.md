# GameZone

Repositorio de presentación de GameZone, un sitio web estático sobre videojuegos con fichas de títulos, noticias, buscador y una experiencia visual retro. Este repositorio existe para mostrar el proyecto y facilitar su visualización; no está pensado para ser editado por terceros ni como plantilla.


## Estado del repositorio

- Propósito: exhibición y referencia del proyecto.
- Contribuciones: no se aceptan Pull Requests ni Issues de terceros.
- Reutilización: este repositorio no declara una licencia pública. Si deseas reutilizar contenido o código, solicita permiso al autor antes de hacerlo.


## Cómo visualizar el sitio

Acceso en línea (recomendado):

- https://bit.ly/gamezonesite
- https://impaul17.github.io/GameZone/

También puedes abrirlo en local (opcional):
- Abre `index.html` directamente en tu navegador, o
- Usa un servidor estático para mejor experiencia de desarrollo:
  - VS Code: extensión "Live Server" → botón "Go Live".
  - Python 3: `python -m http.server 8080` y abre `http://localhost:8080`.


## Características principales

- Páginas dedicadas para juegos (carpeta `games/`).
- Página principal con destacados y navegación.
- Noticias y secciones informativas.
- Buscador (`buscar.html`).
- Recursos visuales y de audio incluidos (logos, iconos, fuentes, sonidos) con estética retro.


## Estructura del proyecto (resumen)

- `index.html` — Página principal del sitio.
- `games.html` — Índice/listado de juegos.
- `noticias.html` — Sección de noticias.
- `buscar.html` — Buscador del sitio.
- `about.html` — Información del proyecto.
- `dmca.html` — Aviso/gestión de DMCA.
- `games/` — Directorio con una página HTML por juego.
- `images/`, `logos/`, `fonts/`, `sounds/` — Recursos gráficos, tipográficos y de audio.
- Documentación adicional:
  - `NOTIFICACIONES_README.md` — Detalles del sistema de notificaciones por email.
  - `plantilla-juego.md` — Referencia interna usada para crear fichas (no orientada a contribuciones externas).


## Sistema de notificaciones (opcional)

El proyecto incluye un sistema de suscripción con almacenamiento local. La integración con EmailJS para el envío de correos reales está preparada pero aún no está configurada (próximamente). La web funciona sin EmailJS.

Consulta la guía completa: [NOTIFICACIONES_README.md](./NOTIFICACIONES_README.md)


## Aviso legal (DMCA)

Si eres titular de derechos y deseas solicitar la retirada de contenido, utiliza: [dmca.html](./dmca.html)


## Créditos y recursos

- Tipografía: `fonts/SnesItalic.ttf` (revisa los términos de la fuente antes de reutilizarla).
- Iconos y logotipos: carpetas `images/` y `logos/`.
- Integración de correo: [EmailJS](https://www.emailjs.com/).
