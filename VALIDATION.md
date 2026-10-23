# Validación de Hera Video

Comprobado en el entorno de trabajo:

- Compilación Vite de producción correcta.
- 8 pruebas automatizadas aprobadas: autenticación privada, persistencia de proyectos/recursos/sesiones tras reiniciar, validación de escenas y protección de origen.
- Exportaciones reales MP4, WebM, GIF y MOV, con inspección ffprobe. Transparencia MOV comprobada extrayendo alfa.
- Render con imagen, vídeo y audio importados; stream de audio confirmado.
- Prueba de navegador aprobada: inicio de sesión, texto, keyframes, guardado automático, recuperación al recargar y rechazo de SVG. Usa un servidor y datos temporales independientes; aprobada también dentro de Docker.
- Docker construido correctamente tras corregir resolución del proxy y montar su CA mediante secretos BuildKit; verificación TLS y firmas de paquetes conservadas. Las 8 pruebas API/render también aprobaron dentro del contenedor.
- Arranque con volumen persistente comprobado: inicializa permisos, ejecuta el proceso como UID 1000, entrega cookies Secure/HttpOnly/SameSite Strict detrás de proxy HTTPS y conserva la sesión al reiniciar. OpenAI permanece desactivado.
- GitHub Actions preparado para construir la imagen y ejecutar las pruebas API y del navegador.

Publicación externa pendiente de la cuenta del propietario en Railway, autorización del repositorio y selección del plan. La URL HTTPS se generará desde el panel; no está publicada todavía. Instrucciones en DEPLOY.md.

OPENAI_API_KEY permanece sin configurar. La generación real de OpenAI no se ha ejecutado; sin la clave se informa del requisito (HTTP 503). El editor, guardado y exportación funcionan independientemente.
