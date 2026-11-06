# ÓRBITA · imagen orbita-api: Open Liberty con la API REST (orbita-api.war), el servidor MCP (orbita-mcp.war) y el
# controlador JDBC de PostgreSQL. Construir desde la raíz del repositorio:
#   docker build -f images/api/Dockerfile -t orbita-api .
# Nada específico de una instalación va dentro: todo llega por variables de entorno (chart/hcl-dx-orbita).

# Las WAR y el JAR no dependen de la arquitectura: se construyen una vez, en la plataforma nativa, para todas
FROM --platform=$BUILDPLATFORM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY api/ api/
RUN mvn -B -q -f api/pom.xml package \
 && mvn -B -q dependency:copy -Dartifact=org.postgresql:postgresql:42.7.14 -DoutputDirectory=/out/lib \
 && cp api/rest/target/orbita-api.war api/mcp/target/orbita-mcp.war /out/

FROM icr.io/appcafe/open-liberty:26.0.0.9-kernel-slim-java21-openj9-ubi-minimal
ARG VERSION=dev
LABEL org.opencontainers.image.title="orbita-api" \
      org.opencontainers.image.description="ÓRBITA: API REST y servidor MCP (Open Liberty)" \
      org.opencontainers.image.vendor="EUROPESIP" \
      org.opencontainers.image.version="${VERSION}"
# Las funciones de Liberty que pide server.xml (se descargan al construir, no al arrancar)
COPY --chown=1001:0 images/api/server.xml /config/
RUN features.sh
COPY --chown=1001:0 --from=build /out/lib/ /config/lib/
COPY --chown=1001:0 --from=build /out/orbita-api.war /out/orbita-mcp.war /config/apps/
# Optimiza el arranque (caché de clases de OpenJ9) como recomienda la imagen de Open Liberty
RUN configure.sh
ENV ORBITA_VERSION=${VERSION}
EXPOSE 9080 9081
