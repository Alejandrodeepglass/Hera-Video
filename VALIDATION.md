# Validación de Hera Video

Comprobado en el entorno de trabajo:

- Compilación Vite de producción correcta.
- 8 pruebas automatizadas aprobadas: autenticación privada, persistencia de proyectos/recursos/sesiones tras reiniciar, validación de escenas y protección de origen.
- Exportaciones reales MP4, WebM, GIF y MOV, con inspección ffprobe. Transparencia MOV comprobada extrayendo alfa.
- Render con imagen, vídeo y audio importados; stream de audio confirmado.
- Prueba de navegador aprobada: inicio de sesión, texto, keyframes, guardado automático, recuperación al recargar y rechazo de SVG. Usa un servidor y datos temporales independientes.
- Docker corregido para resolver el proxy y utilizar su CA mediante secretos BuildKit. Se mantiene verificación TLS y firmas de paquetes. El resultado final de construcción y pruebas del contenedor se registra al terminar la comprobación.
- Arranque de volúmenes preparados para Railway: inicializa permisos y baja a usuario node.
- GitHub Actions preparado para construir la imagen y ejecutar las pruebas API y del navegador.

Publicación externa pendiente de la cuenta del propietario en Railway, autorización del repositorio y selección del plan. La URL HTTPS se generará desde el panel; no está publicada todavía. Instrucciones en DEPLOY.md.

OPENAI_API_KEY permanece sin configurar. La generación real de OpenAI no se ha ejecutado; sin la clave se informa del requisito (HTTP 503). El editor, guardado y exportación funcionan independientemente.
