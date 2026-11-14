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
