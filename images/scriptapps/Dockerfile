# ÓRBITA · imagen orbita-scriptapps: solo las Script Applications YA CONSTRUIDAS, una carpeta por aplicación en /app
# (mi-intranet, fichaje, vacaciones, gastos, aprobaciones, quiosco, comunicacion). El Job del chart (subchart hcl-dx-scriptapp) las
# copia de esta imagen y las sube a WCM con DXClient. Construir desde la raíz del repositorio:
#   docker build -f images/scriptapps/Dockerfile -t orbita-scriptapps .

# 1. Construir (Vite + scripts/scriptapps.mjs: escapes de WCM y comprobación de sintaxis)
FROM --platform=$BUILDPLATFORM node:24.22.1-alpine AS build
WORKDIR /src
COPY api/rutas.json api/rutas.json
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci --no-audit --no-fund
COPY web/ web/
RUN cd web && npm run build:scriptapps

# 2. Imagen mínima con "cp" (busybox), los ficheros y nada más
FROM busybox:1.37.0
ARG VERSION=dev
LABEL org.opencontainers.image.title="orbita-scriptapps" \
      org.opencontainers.image.description="ÓRBITA: Script Applications para HCL DX (imagen bundle)" \
      org.opencontainers.image.vendor="EUROPESIP" \
      org.opencontainers.image.version="${VERSION}"
COPY --from=build --chown=1000:1000 /src/web/build/scriptapps /app
USER 1000:1000
CMD ["ls", "-lR", "/app"]
