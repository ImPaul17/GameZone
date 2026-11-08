# Comprobación del origen y del acceso público

Revisión: **8 de noviembre de 2026**. Origen comprobado: `https://gamezone-impaul17.netlify.app`.

Durante la primera publicación se observó una respuesta 403 al iniciar Discord desde el origen correcto, junto con la ausencia de «Mi cuenta» en la navegación. El 8 de noviembre **el fallo ya no se reproduce**, sin cambios nuevos en los módulos de autenticación. Netlify sigue sirviendo el mismo despliegue `6ae805ddcc17eaddb8ccdcd5`, commit `98c56f2a73322ace954c90eb8ea774d43d91cc8e`, publicado el 2 de noviembre. Los logs del despliegue anterior y este indican OpenNext 5.16.5 y Next.js 16.4.3.

No se ha acreditado la causa de la observación anterior. No se modifica la comprobación de origen ni se confía en encabezados reenviados para intentar corregir un problema que actualmente no aparece. Una propagación temporal del alojamiento es una posibilidad, no una conclusión verificada.

## Comprobación repetible

Desde el repositorio, con las dependencias instaladas:

```powershell
node scripts/verify-public-deployment.mjs
```

El script solo realiza solicitudes públicas: no lee archivos de credenciales, no inicia una sesión de usuario ni conserva cookies. Comprueba:

- Las 17 páginas originales, raíz, cuenta y panel responden 200.
- Todas las páginas con el menú original contienen una sola entrada de cuenta.
- El catálogo público contiene juegos; el resultado actual es nueve.
- Tres inicios de Discord consecutivos devuelven 200, autorización PKCE y el callback canónico de producción.
- Las cookies emitidas son Secure, HttpOnly y SameSite=Lax; sus valores y la URL OAuth completa no se imprimen.
- El inicio con un origen ajeno y la mutación sin `Origin` reciben 403.
- Perfil y noticias editoriales reciben 401 sin sesión y conservan encabezados de caché privada.

Resultado de esta revisión: **correcto, cero fallos**. Las tres rondas de Discord emitieron tres cookies cada una, con los atributos esperados. La prueba distingue «el servidor acepta iniciar OAuth» de completar la autorización real de Discord, que requiere una persona. El propietario ya había confirmado ese recorrido y su perfil en producción.

Esta comprobación debe repetirse después del despliegue de la importación por lotes. Si reaparece el 403, la respuesta roja del script permite investigarlo antes de entregar la versión. La comprobación del servidor sigue en [`requestOrigin`](../src/modules/accounts/auth.ts); las cookies de Supabase siguen en [`supabaseSessionTransport`](../src/modules/accounts/supabase.ts).
