# GLOD · Supabase + GitHub + Vercel

## Arquitectura vigente
- Tienda pública: `/`.
- Panel independiente: `/admin`, sin enlace en navegación pública.
- Fuente de datos: Supabase PostgreSQL (`glod_models`, `glod_variants`).
- Autenticación: Supabase Auth, con autorización mediante `glod_admins`.
- Fotos iniciales: 141 archivos WebP optimizados servidos desde `/assets/catalogo-web/` en GitHub/Vercel.
- Fotos nuevas: bucket público `glod-catalog` de Supabase Storage, con escritura restringida por RLS a administradores.
- Google Drive: respaldo histórico de originales; no se consulta desde el sitio.
- Google Sheets y Google Cloud API: retirados del sitio y panel.

## Supabase
Organización: glod.bags (Free)
Proyecto: glod-bags
Ref: inkzqdtkealzzcujeyqa

Migrados: 30 modelos y 141 variantes, con SKU, color, HEX, precios detal/mayor y fotografía original de referencia.
El usuario inicial de Supabase Auth ya está autorizado en `glod_admins`.
No insertar otros usuarios automáticamente: cada nuevo administrador requiere aprobación y asignación manual.

## Administración
1. Abrir `https://<dominio>/admin`.
2. Iniciar sesión con **correo electrónico** y contraseña registrados en Supabase Auth.
3. Consultar, crear, editar, activar o desactivar productos. Los cambios se guardan en Supabase.
4. Para subir nuevas imágenes: formulario de producto -> fotografía -> Guardar. Las imágenes nuevas se guardan en Supabase Storage.

No utilizar el antiguo usuario de `.env` de Sheets; el inicio de sesión usa correo/contraseña de Supabase Auth.

## Imágenes iniciales
Las 141 fotografías WebP ya existen en GitHub en `assets/catalogo-web/` y se muestran sin depender de Google.
PENDIENTE: copiar físicamente esas fotografías iniciales al bucket `glod-catalog`. No confundir la migración de la metadata SQL (completada) con la migración de bytes al Storage (pendiente).
Hasta entonces el catálogo sirve las imágenes por Vercel y sigue operativo.

## Seguridad
- La clave pública `sb_publishable_...` puede incluirse en código frontend; no es la clave `service_role`.
- Nunca incluir service_role, secretos, contraseñas o claves privadas en GitHub.
- PostgreSQL y Storage con RLS; el permiso admin está basado en `glod_admins`, no solo en estar autenticado.
- Permisos en `glod_admins` se asignan de forma manual.

## Nota para Vercel
- La API pública `/api/catalog` consulta Supabase PostgREST sin secretos.
- El panel usa Supabase Auth y REST con la clave publishable.
- No es necesario configurar Google Cloud, Sheets ni `.env` del administrador anterior.


## Seguridad del panel (develop, 14 de noviembre de 2026)

El panel de administración consume exclusivamente `/api/admin` (Vercel Functions). El código HTML/JS no lleva clave de Supabase, dirección del proyecto, correo de un administrador ni tokens. El endpoint público `/api/catalog` también usa variables de entorno del servidor.

**Configuración obligatoria en Vercel, entorno Preview (rama develop):**
- `SUPABASE_URL`: dirección HTTPS del proyecto Supabase (sin barra final).
- `SUPABASE_PUBLISHABLE_KEY`: clave pública publishable; guardada como variable de entorno no prefijada por `NEXT_PUBLIC_` ni `VITE_`.

Agregar estas variables directamente en Vercel, nunca en archivos versionados o commits. Configurar variables equivalentes para Production solamente antes de aprobar un release de `main`. Las funciones responden 503 si falta configuración, en vez de publicar un valor incrustado.

La API usa sesiones `HttpOnly; Secure; SameSite=Strict`, origen comprobado para operaciones POST, validación de identificadores, campos y fotos, autorización de usuario mediante Supabase Auth y registro en `glod_admins`, y RLS de PostgreSQL. No utiliza `service_role`. El borrado definitivo requiere confirmación visual. Los modelos con variantes vinculadas se protegen mediante FK `ON DELETE RESTRICT`. El estado activo/inactivo se gestiona por separado del borrado. La autenticación contra Supabase Auth conserva las medidas de limitación de intentos del proveedor; esta versión no implementa un rate limiter distribuido adicional.

**Verificación antes de publicación:** configurar variables de entorno y generar un Preview de Vercel; comprobar login, expiración de sesión, cierre de sesión, filtros, CRUD, subida de archivo y rechazo de borrado de modelos con variantes. No fusionar con `main` hasta completar estas pruebas.

Las claves publishable no son claves secretas, aunque conviene rotarlas si existe alguna política interna de higiene de credenciales. Una vez que una cadena aparece en un commit público, borrar su aparición del archivo actual no elimina automáticamente el historial Git.
