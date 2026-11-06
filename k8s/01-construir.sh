#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 1 · Construir los artefactos en Linux (sin Maven, Node ni Docker).
#
#  - Descarga, si faltan, un JDK portable (Temurin 21), la API de Servlet 4.0 y el controlador JDBC de PostgreSQL
#    (el mismo 42.7.11 que usa la WebEngine de CF238) en .herramientas/ y comprueba sus SHA-1 de Maven Central.
#  - Compila la lógica (portlet/java) y el servicio REST (rest/java) para Java 8 y empaqueta build/k8s/suite-api.war
#    (clases y web.xml), y el servidor MCP (mcp/java, con la misma lógica) en build/k8s/orbita-mcp.war.
#  - Prepara las Script Applications en build/k8s/scriptapps/<página>/ a partir de build/scriptapps/ (las genera
#    "npm run build:scriptapps", tarea de VS Code "Suite: compilar interfaz React") con las URL de DX Compose.
#
# Equivalente manual:  javac --release 8 -cp javax.servlet-api.jar -d classes ... && jar cf suite-api.war ...
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd curl tar sha1sum
cd "$SUITE_DIR"

# --- Herramientas -------------------------------------------------------------------------------------------------
mkdir -p "$HERRAMIENTAS"
if [[ ! -x "$HERRAMIENTAS/jdk/bin/javac" ]]; then
  info "Descargando JDK Temurin 21 (portable) en $HERRAMIENTAS/jdk"
  curl -fsSL -o "$HERRAMIENTAS/jdk.tgz" "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$HERRAMIENTAS/jdk" && tar -xzf "$HERRAMIENTAS/jdk.tgz" -C "$HERRAMIENTAS/jdk" --strip-components=1
  rm -f "$HERRAMIENTAS/jdk.tgz"
fi
maven() {  # maven <ruta en Maven Central>  -> .herramientas/<fichero>, comprobando el SHA-1 publicado
  local f; f="$HERRAMIENTAS/$(basename "$1")"
  [[ -f "$f" ]] && return 0
  info "Descargando $(basename "$1")"
  curl -fsSL -o "$f.tmp" "https://repo1.maven.org/maven2/$1"
  echo "$(curl -fsSL "https://repo1.maven.org/maven2/$1.sha1" | awk '{print $1}')  $f.tmp" | sha1sum -c --quiet - \
    || { rm -f "$f.tmp"; die "SHA-1 incorrecto en $1"; }
  mv "$f.tmp" "$f"
}
maven javax/servlet/javax.servlet-api/4.0.1/javax.servlet-api-4.0.1.jar
maven org/postgresql/postgresql/42.7.11/postgresql-42.7.11.jar
maven javax/json/javax.json-api/1.1.4/javax.json-api-1.1.4.jar   # solo para compilar el MCP (Liberty: jsonp-1.1)
JDK="$HERRAMIENTAS/jdk/bin"

# --- suite-api.war ------------------------------------------------------------------------------------------------
info "Compilando (Java 8) y empaquetando $SALIDA/suite-api.war"
rm -rf "$SALIDA/war" && mkdir -p "$SALIDA/war/WEB-INF/classes"
"$JDK/javac" --release 8 -nowarn -encoding UTF-8 -Xlint:-options \
  -cp "$HERRAMIENTAS/javax.servlet-api-4.0.1.jar" -d "$SALIDA/war/WEB-INF/classes" \
  portlet/java/com/demo/suite/*.java rest/java/com/demo/suite/*.java
cp rest/web.xml "$SALIDA/war/WEB-INF/web.xml"
rm -f "$SALIDA/suite-api.war"
"$JDK/jar" cf "$SALIDA/suite-api.war" -C "$SALIDA/war" .
cp "$HERRAMIENTAS/postgresql-42.7.11.jar" "$SALIDA/postgresql.jar"
ok "suite-api.war ($(du -k "$SALIDA/suite-api.war" | cut -f1) KiB, $(find "$SALIDA/war/WEB-INF/classes" -name '*.class' | wc -l) clases)"

# --- orbita-mcp.war (servidor MCP: POST /mcp y GET /probe/ready en la raíz del puerto 9081) -----------------------
info "Compilando (Java 8) y empaquetando $SALIDA/orbita-mcp.war"
rm -rf "$SALIDA/mcp-war" && mkdir -p "$SALIDA/mcp-war/WEB-INF/classes"
"$JDK/javac" --release 8 -nowarn -encoding UTF-8 -Xlint:-options \
  -cp "$HERRAMIENTAS/javax.servlet-api-4.0.1.jar:$HERRAMIENTAS/javax.json-api-1.1.4.jar" -d "$SALIDA/mcp-war/WEB-INF/classes" \
  portlet/java/com/demo/suite/*.java mcp/java/com/demo/orbita/mcp/*.java
cp mcp/web.xml "$SALIDA/mcp-war/WEB-INF/web.xml"
cp mcp/ibm-web-bnd.xml "$SALIDA/mcp-war/WEB-INF/ibm-web-bnd.xml"   # virtual host mcp_host (puerto 9081)
rm -f "$SALIDA/orbita-mcp.war"
"$JDK/jar" cf "$SALIDA/orbita-mcp.war" -C "$SALIDA/mcp-war" .
ok "orbita-mcp.war ($(du -k "$SALIDA/orbita-mcp.war" | cut -f1) KiB)"

# --- Script Applications --------------------------------------------------------------------------------------------
[[ -f build/scriptapps/mi-intranet/suite.js ]] \
  || die "Falta build/scriptapps: genéralo con 'npm ci && npm run build:scriptapps'"
info "Script Applications en $SALIDA/scriptapps (páginas $SUITE_PAGINAS, quiosco $SUITE_QUIOSCO, API $SUITE_PATH)"
rm -rf "$SALIDA/scriptapps" && mkdir -p "$SALIDA/scriptapps"
for app in mi-intranet fichaje vacaciones gastos aprobaciones quiosco; do
  mkdir -p "$SALIDA/scriptapps/$app"
  # WCM interpreta "[$...]" (también "[ $...]") como una etiqueta suya y la ELIMINA al servir el fichero, p. ej.
  # "[$,H]=useState()" o `[${e}]` en un log: el JavaScript quedaría roto. Se escriben con escapes equivalentes:
  #   `[${  ->  `\x5b${   (al empezar una plantilla de texto: \x5b es "[" y ${ sigue siendo una sustitución)
  #   [$    ->  [$   (en el resto: $ es "$" en identificadores, cadenas y expresiones regulares)
  sed -e 's/`\[\${/`\\x5b${/g' -e 's/\[\$/[\\u0024/g' "build/scriptapps/$app/suite.js" > "$SALIDA/scriptapps/$app/suite.js"
  cp "build/scriptapps/$app/suite.css" "$SALIDA/scriptapps/$app/suite.css"
  ! grep -q '\[ *\$' "$SALIDA/scriptapps/$app/suite.css" || die "suite.css contiene '[\$', que WCM eliminaría"
  sed -e "s#data-api=\"[^\"]*/\(api\|publico\)\"#data-api=\"$SUITE_PATH/\1\"#" \
      -e "s#data-paginas=\"[^\"]*\"#data-paginas=\"$SUITE_PAGINAS\"#" \
      -e "s#data-quiosco=\"[^\"]*\"#data-quiosco=\"$SUITE_QUIOSCO\"#" \
      "build/scriptapps/$app/index.html" > "$SALIDA/scriptapps/$app/index.html"
done
grep -ho 'data-app="[^"]*" data-api="[^"]*"' "$SALIDA"/scriptapps/*/index.html | sed 's/^/    /'
echo "Siguiente: k8s/02-usuarios-ldap.sh"
