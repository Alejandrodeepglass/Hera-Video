# Hera Video

Hera Video (antes Motion Studio AI) es un estudio privado de motion graphics: React + Remotion, API Express y SQLite. Una contraseña protege el estudio completo; es un espacio compartido de un solo propietario, sin cuentas ni organizaciones múltiples.

## Inicio

Requisitos: Node.js 24, npm, Chromium y FFmpeg/ffprobe en Linux. En Debian/Ubuntu: `apt-get install chromium ffmpeg fonts-dejavu-core`. Recomendado: 2 CPU, 4 GB RAM y disco persistente. No requiere base de datos externa.

```sh
cd /workspace/Hera-Video
npm ci --cache /tmp/motion-npm-cache
npm run build
npm start
```

El proceso escucha en la interfaz local, puerto 3000. Sin `STUDIO_PASSWORD`, genera una contraseña en `data/admin-password` con permisos 0600. Consulta ese archivo directamente en tu terminal para entrar; no lo publiques. Alternativamente, configura tu propia contraseña en el gestor de secretos del servidor. No hay credenciales predeterminadas en el código.

Para desarrollo, deja la API ejecutándose y usa `npm run dev` en otra terminal. Vite reenvía `/api` al backend. Usa el mismo origen para el editor y las peticiones API. No uses Vite como servidor público de producción.

## Editor

- Selecciona capas en la columna izquierda o timeline; añade texto, formas, imágenes, vídeo y audio.
- Importa PNG/JPEG/WebP/GIF, MP4/WebM o MP3/WAV/OGG desde Recursos (50 MB por archivo). SVG y archivos ejecutables no están admitidos.
- Cambia posición, escala, rotación y opacidad en Propiedades. Cambiar una transformación crea o actualiza el keyframe en el fotograma actual. La interpolación es lineal. Los diamantes permiten saltar a cada clave.
- Ajusta entrada/salida de capas en frames, tamaño, texto, color, fondo, duración y formato. El orden de capas se puede cambiar con Subir. Duplica, oculta, elimina y deshaz cambios.
- Reproduce la escena o mueve el cabezal en el timeline. El guardado automático empieza tras modificar la escena; también hay un botón Guardar. Abre proyectos previos con el selector.
- Exporta MP4 (H.264), WebM (VP8), GIF animado o MOV (ProRes 4444 con alfa). MOV omite el fondo de la composición; las capas mantienen su opacidad. GIF no contiene audio. La cola procesa un render a la vez, con máximo tres trabajos pendientes y concurrencia de render de dos.

## OpenAI: secreto pendiente

`OPENAI_API_KEY` **no está configurada**. La generación no está simulada: sin clave responde 503 y muestra el requisito en el editor. El resto del estudio funciona sin OpenAI.

Configura `OPENAI_API_KEY` exclusivamente en el gestor de secretos del servidor de destino. Para un uso local, copia `.env.example` a `.env`, introduce el valor en ese archivo protegido (`chmod 600 .env`) y reinicia. `.env` está excluido de Git y Docker. Nunca uses el prefijo `VITE_` para esta clave: solo el backend debe recibirla. El servidor carga `.env` al ejecutar `npm start`.

Modelo predeterminado: `gpt-4.1-mini`, modificable mediante `OPENAI_MODEL`. Se necesita acceso HTTPS a `api.openai.com`, una cuenta de API con saldo y acceso al modelo. Los prompts se envían a OpenAI y pueden generar costes; los archivos importados no se envían a OpenAI. La respuesta se analiza como JSON y se valida antes de aceptarla; el modelo nunca genera código ejecutable.

El configurador de secretos proxy de este entorno reserva los nombres con prefijo `OPENAI_`; por eso no se creó una declaración inválida ni se guardó una clave en un campo de texto. Configura el nombre exacto `OPENAI_API_KEY` como secreto del servidor de despliegue. La llamada real a OpenAI queda pendiente de ese valor y de probarla con una cuenta autorizada.

## Persistencia y seguridad

`DATA_DIR` (por defecto `data/`) contiene SQLite, recursos, exportaciones, sesiones y secretos locales generados. Conserva este directorio completo en disco persistente. Haz copias de seguridad coherentes con el proceso detenido o mediante SQLite Backup API; no copies solo el archivo principal mientras WAL esté activo. Los proyectos no se almacenan únicamente en el navegador.

Todas las rutas de proyectos, recursos y exportaciones exigen sesión. Cookies HttpOnly/SameSite Strict, protección de origen en operaciones de escritura, límite de intentos de contraseña y validación de escenas. Las sesiones persisten en SQLite. Los renders pendientes se marcan fallidos tras reinicio y pueden relanzarse. El endpoint de salud solo revela disponibilidad. No se imprimen claves ni contraseñas en registros.

Para exponer el servicio, usa un dominio y un proxy HTTPS de confianza. Configura `COOKIE_SECURE=1` y `TRUST_PROXY=1` detrás de un único proxy controlado; no expongas directamente el puerto de Node. No hay aislamiento entre múltiples usuarios: quien tiene la contraseña tiene acceso a todos los proyectos. No está diseñado como plataforma pública multiusuario.

## Despliegue

```sh
# Crear .env con secretos mediante tu gestor seguro, sin subirlo al repositorio.
docker compose up -d --build
```

Compose publica solo en la interfaz local y conserva datos en `studio-data`. Sitúa Caddy/Nginx o el proxy de tu proveedor delante del puerto 3000. Se incluye un Dockerfile con Chromium y FFmpeg y ejecución como usuario sin privilegios. Para consultar la contraseña generada, accede a `/app/data/admin-password` dentro del contenedor desde tu terminal privada.

Variables: `HOST` (127.0.0.1 fuera de Docker), `PORT` (3000), `DATA_DIR`, `CHROME_PATH` (/usr/bin/chromium), `STUDIO_PASSWORD`, `SESSION_SECRET` (opcional; si falta se genera y conserva), `OPENAI_API_KEY`, `OPENAI_MODEL`, `COOKIE_SECURE`, `TRUST_PROXY`.

Servicios externos: OpenAI para generación; proveedor de hosting con procesos Node/Chromium, almacenamiento persistente y dominio/TLS para publicación. No necesita S3, Redis, Supabase ni funciones externas de render. Revisa los términos/licencia de Remotion según el uso de tu organización antes de explotación comercial.

Publicación HTTPS: consulta [DEPLOY.md](DEPLOY.md), con la recomendación de hosting y los pasos del panel. El acceso a OpenAI sigue pendiente de configurar de forma segura. Consulta [VALIDATION.md](VALIDATION.md) para resultados comprobados.

## Pruebas

```sh
npm run build
npm test
npm run test:browser
```

Las pruebas API usan un directorio temporal y contraseña de prueba, verifican autenticación, persistencia tras reinicio, validación, recursos, secreto ausente, protección de origen y renders reales de los cuatro formatos con ffprobe. MOV también se decodifica para comprobar píxeles alfa. Las pruebas no llaman OpenAI ni generan cargos.

Límites actuales: un solo propietario, hasta 60 s a 30 fps por escena, 50 capas, keyframes lineales, sin edición de curvas ni recorte de contenido audiovisual (la entrada/salida coloca el clip completo desde su inicio). Los renders grandes pueden consumir mucha RAM, especialmente recursos convertidos a data URL. No se ha validado carga concurrente de producción ni generaciones reales sin la clave pendiente.
