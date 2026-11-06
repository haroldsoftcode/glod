# GLOD /adm — configuracion (solo develop)

La version publica actual de GLOD permanece en **main**. Este panel solamente se prepara en **develop**.

## Arquitectura
- Google Sheets es la fuente de verdad: pestañas 'Modelos' y 'Variantes'.
- Google Drive guarda fotos cargadas desde el administrador en una carpeta privada compartida con la cuenta de servicio.
- Vercel sirve APIs protegidas, y el catalogo publico consulta '/api/catalog'. Mientras no haya Google configurado, la web conserva su JSON estatico.
- Login del administrador: nombre y clave definidos exclusivamente mediante variables de entorno; nunca hardcodeados en GitHub.
- La administracion se encuentra en '/adm'; no se agrega al nav.
- Archivar conserva registro y lo excluye del catalogo; no borra irreversiblemente datos ni fotos.

## Preparacion en Google
1. Crear una Google Sheet vacia (no hace falta crear manualmente las pestañas).
2. Crear carpeta de fotos en Google Drive.
3. En Google Cloud, activar **Google Sheets API** y **Google Drive API**, y crear una cuenta de servicio con permisos limitados.
4. Compartir la Sheet y la carpeta con el correo de la cuenta de servicio, permiso editor.
5. Configurar las variables de entorno en Vercel Preview (solo develop inicialmente):

- GLOD_SHEET_ID = ID de la hoja, no su URL.
- GLOD_DRIVE_FOLDER_ID = ID de la carpeta compartida.
- GOOGLE_SERVICE_ACCOUNT_EMAIL = correo de la cuenta de servicio.
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = clave PEM privada de la cuenta de servicio; no poner en Git.
- GLOD_ADMIN_USERNAME = nombre de usuario administrativo.
- GLOD_ADMIN_PASSWORD_SCRYPT = salt:hash obtenido usando el comando de abajo.
- GLOD_SESSION_SECRET = secreto aleatorio minimo 32 bytes generado de forma segura.

Generar hash de contrasena localmente (NO imprimir contraseña en logs, no guardar en archivos):
node -e "const c=require('crypto'), p=process.env.GLOD_NEW_ADMIN_PASSWORD, s=c.randomBytes(16).toString('hex');if(!p)throw Error('Defina GLOD_NEW_ADMIN_PASSWORD localmente');console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))"

Generar secreto de cookie:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

No reutilizar claves enviadas en un chat: usa una clave nueva y única.

## Primera ejecucion
1. Abrir el deployment Preview develop '/adm' e iniciar sesion.
2. Pulsar "Importar catalogo inicial" **una sola vez** (30 modelos y 141 variantes).
3. Comprobar registros, precios, chips y toggles.
4. Subir imagen desde formulario de variante. Se guardara en la carpeta Drive; la imagen en la web se cargara a traves de '/api/image?id=...'.
5. Cualquier modificacion guardada en Sheets se publica al recargar el catalogo; API cache de 60 segundos en CDN.

## Funcionamiento y limitaciones
- El API de Google **no usa** credenciales del usuario final; utiliza cuenta de servicio en backend.
- La subida JSON base64 soporta archivos maximo 3 MB por foto; Vercel limita el tamano de peticiones serverless. Las fotos originales se mantienen en Drive.
- Los productos existentes siguen visibles aun si Sheets esta sin configurar, gracias al JSON incluido en index.html.
- Si Sheets falla tras inicializar, se usa el catalogo estatico anterior como respaldo temporal. Para un lanzamiento definitivo conviene monitoreo, versiones publicadas y backups de Sheets.
- Un SKU/ID existente no debe usarse como identificador inmutable; cada registro lleva UUID propio.
- El modelo se puede archivar con todas sus variantes sin borrarlas.
- Google Drive no es CDN; el proxy por Vercel es apropiado para una tienda pequena, pero a escala alta conviene mover las miniaturas a almacenamiento/CDN.
- No almacenar nunca claves o tokens de servicio en archivos publicos, JavaScript del navegador, ni GitHub.

## Recursos Google creados

- Hoja nativa GLOD (30 modelos y 141 variantes YA importados): https://docs.google.com/spreadsheets/d/1V_kPobuj6aSpH4tNQiB0VKmASygHu2qUqUXyZExD5hI/edit
- Carpeta de originales en Drive: https://drive.google.com/drive/folders/1vw5PNydql9U3PSwlJbPBaTeLtJmiQ3z6
- GLOD_SHEET_ID = 1V_kPobuj6aSpH4tNQiB0VKmASygHu2qUqUXyZExD5hI
- GLOD_DRIVE_FOLDER_ID = 1vw5PNydql9U3PSwlJbPBaTeLtJmiQ3z6

No volver a ejecutar la importación inicial: los registros ya están en la hoja creada.

IMPORTANTE: las cuentas de servicio de Google pueden no tener cuota de almacenamiento para subir imágenes a carpetas de My Drive aunque estén compartidas. Si falla la carga, utilizar una unidad compartida habilitada o implementar carga OAuth del propietario o un almacenamiento alternativo para archivos. La subida Drive aún requiere pruebas reales.

Se debe crear una cuenta de servicio de Google Cloud habilitada para Sheets y Drive, compartirle la hoja y la carpeta, y configurar las credenciales exclusivas de Preview en Vercel. No subir claves a GitHub ni pegarlas en el chat.
