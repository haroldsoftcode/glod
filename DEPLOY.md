# GLOD · Deploy de desarrollo

## Rama de trabajo

- `develop`: catálogo interactivo de prueba, con 30 modelos y 141 colores.
- `main`: sin código de sitio, reservada para producción cuando se apruebe la versión de prueba.

## Despliegue Vercel

1. Conectar el repositorio `haroldsoftcode/glod` a un proyecto Vercel del equipo `haroldsoftcode`.
2. Mantener `main` como Production Branch; no promover `develop` a producción.
3. Crear un despliegue de Preview desde el ref `develop`.
4. Elegir `Other` como framework; el prototipo es HTML, CSS y JavaScript estático, sin build.
5. Comprobar la URL de Preview y la carga de fotografías.

**Importante:** las imágenes de esta edición de GitHub se consultan mediante miniaturas de los archivos compartidos de Drive. Confirmar acceso público y comportamiento de las miniaturas antes de compartir la URL fuera del equipo. Para publicación definitiva, alojar los recursos WebP optimizados dentro del proyecto o en almacenamiento de imágenes con URLs estables.

Los precios son una instantánea del Sheet de catálogo al momento de generarse este commit. La sincronización automática queda para una siguiente fase.
