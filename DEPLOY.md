# Publicar Hera Video con HTTPS

## Recomendación: Railway Hobby

Railway administra Docker, dominio HTTPS y volumen persistente sin administrar un VPS. Es adecuado para este estudio de un propietario y uso ligero; el renderizado consume CPU/RAM y se factura según uso.

Precio comprobado en la documentación oficial: mínimo de **US$5/mes**, que incluye US$5 de recursos. RAM US$10/GB-mes, CPU US$20/vCPU-mes, volumen US$0,15/GB-mes y salida US$0,05/GB. El mínimo no garantiza una factura de US$5: renderizar vídeo puede superarlo. No se recomienda el plan gratuito de 0,5 GB RAM para Chromium/Remotion.

Comparación práctica:

| Opción | SQLite y render Docker | Puesta en marcha | Coste |
| --- | --- | --- | --- |
| Railway Hobby | Sí, volumen y un servicio | La más sencilla para este proyecto; HTTPS incluido | Desde US$5/mes, según consumo |
| VPS con Docker (p. ej., Hetzner) | Sí, disco local | Requiere administrar servidor, backups y TLS | Puede convenir para muchos renders; precio actual no verificado desde este entorno |
| Hosting estático o funciones breves | No para el backend completo actual | No recomendado | Requiere servicios adicionales para persistencia y render |

Fuentes oficiales consultadas desde su repositorio público: [precios](https://github.com/railwayapp/docs/blob/main/content/docs/pricing.md), [planes](https://github.com/railwayapp/docs/blob/main/content/docs/pricing/plans.md), [Dockerfile](https://github.com/railwayapp/docs/blob/main/content/docs/builds/dockerfiles.md), [volúmenes](https://github.com/railwayapp/docs/blob/main/content/docs/volumes.md), [dominio HTTPS](https://github.com/railwayapp/docs/blob/main/content/docs/networking/public-networking.md). Los precios de compra finales se confirman en el panel del proveedor.

## Pasos que requieren tu cuenta

1. Entra en **https://railway.com/new** e inicia sesión con **GitHub**. Autoriza Railway para acceder a `Alejandrodeepglass/Hera-Video` cuando lo solicite. Activa **Hobby** si el panel requiere un plan para los recursos.
2. Pulsa **New Project → GitHub repo / Deploy from GitHub repo** y selecciona **Hera-Video**, rama **main**. Si no aparece, pulsa **Configure GitHub App** y concede acceso a ese repositorio. Railway detecta el Dockerfile. Elige **Add Variables** antes de desplegar si aparece esa opción.
3. En el servicio, abre **Variables → Raw Editor** e introduce lo siguiente. Sustituye SOLO la contraseña por una propia, larga y única. No la compartas en el chat.

```dotenv
HOST=0.0.0.0
DATA_DIR=/app/data
COOKIE_SECURE=1
TRUST_PROXY=1
RAILWAY_RUN_UID=0
STUDIO_PASSWORD=REEMPLAZA_ESTO_POR_TU_CONTRASENA_PRIVADA
```

`RAILWAY_RUN_UID=0` permite inicializar el volumen que Railway monta como root; el entrypoint cambia su propietario y ejecuta Node como usuario `node` sin privilegios. No introduzcas `OPENAI_API_KEY` todavía. No necesitas crear `SESSION_SECRET`: se genera y conserva en el disco. No cambies PORT; el servidor admite el que asigna Railway.

4. En el lienzo del proyecto, clic derecho → **Create Volume / Volume**. Conéctalo al servicio **Hera-Video** y establece **Mount Path = /app/data**. Es imprescindible para no perder proyectos y recursos. Usa una sola réplica. En **Settings → Deploy**, establece **Healthcheck Path = /api/health** y, si se muestran límites, permite al menos 2 vCPU / 4 GB para comenzar. Son límites máximos; Railway factura el uso real. No actives suspensión automática mientras se renderizan trabajos.
5. Pulsa **Deploy / Apply Changes** y espera a que esté **Active**. Después abre **Settings → Networking → Public Networking → Generate Domain**; usa el puerto del servicio (3000 si el panel pide uno y no ha asignado otro). Se genera una dirección `https://…up.railway.app` con certificado automático. No hace falta comprar un dominio.
6. Abre esa dirección e inicia sesión con la contraseña que elegiste. Guarda un proyecto, recarga y exporta un MP4. Comparte únicamente la URL pública para que se pueda verificar la publicación; nunca la contraseña. No envíes tokens de Railway por chat.

El alta, la autorización de GitHub y el método de pago deben realizarlos el propietario de la cuenta. Esta sesión no tiene una cuenta de Railway conectada; no puede crear ni facturar ese servicio por ti.

## Docker dentro del entorno cloud

El problema original era que BuildKit no heredaba la resolución del proxy ni su certificado. Se proporciona `python scripts/cloud-docker-build.py`, que resuelve el proxy en el host y usa secretos BuildKit para el proxy y CA. No incrusta credenciales ni certificados privados en la imagen. No se desactiva la validación TLS ni de paquetes. En un servidor normal usa simplemente `docker build -t hera-video .` o `docker compose up -d --build`.

## Persistencia y mantenimiento

El volumen incluye SQLite (WAL), recursos, sesiones, claves locales y exportaciones. Activa las copias de seguridad del volumen en Railway y comprueba su restauración. No uses varias réplicas sobre esta base SQLite. Los archivos de datos del entorno cloud no se suben a GitHub: el primer despliegue crea un estudio vacío. Las nuevas versiones conservan el volumen; si deseas migrar proyectos existentes, deben transferirse por un canal privado con la aplicación detenida.
