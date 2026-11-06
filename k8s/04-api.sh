#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 4 · Servicio REST suite-api (Open Liberty) en $SUITE_NS con SSO con DX.
#
#  1. Secret suite-api-sso: claves LTPA de la WebEngine (ltpa.keys y su contraseña, leídas del server.xml de la
#     WebEngine) y las credenciales que usan sus registros (wpsadmin y el bind del LDAP).
#  2. ConfigMap suite-api-config: k8s/server.xml + ldap-config.xml y basic-registry-default.xml del chart de DX
#     (ConfigMap <DX_RELEASE>-web-engine-overrides): mismo realm "FederatedRealm" que el portal.
#  3. PVC suite-api-files con suite-api.war, orbita-mcp.war y postgresql.jar (los copia un pod auxiliar con kubectl cp).
#  4. Deployment + Service y la ruta https://$DX_HOST$SUITE_PATH (IngressRoute de Traefik o Ingress de nginx).
#
# Repetirlo tras cambiar el código (01-construir.sh) o la configuración de DX (p. ej. otro LDAP): el pod se recrea
# solo si cambia algo (anotación con la suma de comprobación).
# Nota: las claves LTPA son las de la imagen de la WebEngine. En producción, configura en DX unas claves propias
# (security.webEngine.ltpa.customLtpaSecret) y usa ese mismo secret aquí.
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd kubectl envsubst sha256sum
require_vars DX_NS DX_RELEASE DX_HOST SUITE_NS SUITE_APP SUITE_PATH SUITE_DB PG_HOST SC_RWO INGRESS_CLASS IQ_RELEASE
K8S="$(cd "$(dirname "$0")" && pwd)"
WE="${DX_RELEASE}-web-engine-0"
[[ -f "$SALIDA/suite-api.war" && -f "$SALIDA/orbita-mcp.war" && -f "$SALIDA/postgresql.jar" ]] || die "Faltan los artefactos: ejecuta k8s/01-construir.sh"
kubectl -n "$SUITE_NS" get secret suite-db >/dev/null 2>&1 || die "Falta el secret suite-db: ejecuta k8s/03-base-datos.sh"
is_openshift && die "OpenShift: falta una Route para $SUITE_PATH (no incluida en esta versión)"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"

# --- 1. SSO -----------------------------------------------------------------------------------------------------
info "Claves LTPA y credenciales de los registros de la WebEngine ($WE)"
LTPA_LINE=$(kubectl -n "$DX_NS" exec "$WE" -c web-engine -- sh -c \
  'grep -h -o "<ltpa [^>]*>" /opt/openliberty/wlp/usr/servers/defaultServer/server.xml /opt/openliberty/wlp/usr/servers/defaultServer/configDropins/*/*.xml 2>/dev/null | tail -1')
KEYS_FILE=$(sed -n 's/.*keysFileName="\([^"]*\)".*/\1/p' <<<"$LTPA_LINE")
KEYS_PASSWORD=$(sed -n 's/.*keysPassword="\([^"]*\)".*/\1/p' <<<"$LTPA_LINE")
[[ -n "$KEYS_FILE" && -n "$KEYS_PASSWORD" ]] || die "No encuentro el elemento <ltpa> en la configuración de la WebEngine"
kubectl -n "$DX_NS" exec "$WE" -c web-engine -- cat "$KEYS_FILE" > "$TMP/ltpa.keys"
grep -q '^com.ibm.websphere.ltpa.PrivateKey=' "$TMP/ltpa.keys" || die "$KEYS_FILE no parece un fichero de claves LTPA"
kubectl -n "$DX_NS" get secret dx-ldap-bind >/dev/null 2>&1 || die "Falta el secret dx-ldap-bind: la suite necesita el LDAP del Lab 2A"
secreto() { kubectl -n "$DX_NS" get secret "$1" -o jsonpath="{.data.$2}" | base64 -d; }
apply_secret "$SUITE_NS" generic "${SUITE_APP}-sso" \
  --from-file=ltpa.keys="$TMP/ltpa.keys" \
  --from-literal=ltpa-password="$KEYS_PASSWORD" \
  --from-literal=dx-admin="$(secreto web-engine-secret username)" \
  --from-literal=dx-password="$(secreto web-engine-secret password)" \
  --from-literal=ldap-bind-user="$(secreto dx-ldap-bind bindUser)" \
  --from-literal=ldap-bind-password="$(secreto dx-ldap-bind bindPassword)"

# --- 2. Configuración de Liberty ------------------------------------------------------------------------------------
info "ConfigMap ${SUITE_APP}-config (server.xml + registros del chart de DX)"
for f in ldap-config.xml basic-registry-default.xml; do
  kubectl -n "$DX_NS" get cm "${DX_RELEASE}-web-engine-overrides" -o jsonpath="{.data.${f//./\\.}}" > "$TMP/$f"
  [[ -s "$TMP/$f" ]] || die "El ConfigMap ${DX_RELEASE}-web-engine-overrides no tiene $f (¿Lab 2A hecho?)"
done
kubectl -n "$SUITE_NS" create configmap "${SUITE_APP}-config" --from-file=server.xml="$K8S/server.xml" \
  --from-file="$TMP/ldap-config.xml" --from-file="$TMP/basic-registry-default.xml" --dry-run=client -o yaml | kubectl apply -f -
env_we() { kubectl -n "$DX_NS" get sts "${DX_RELEASE}-web-engine" -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name==\"$1\")].value}"; }
export SUITE_TZ DX_ADMIN_GROUP DX_BASIC_REGISTRY_REALM
SUITE_TZ=$(env_we TZ); SUITE_TZ=${SUITE_TZ:-UTC}
DX_ADMIN_GROUP=$(env_we DX_ADMIN_GROUP); DX_BASIC_REGISTRY_REALM=$(env_we DX_BASIC_REGISTRY_REALM)

# --- 3. TLS de la ruta: el mismo certificado que DX -----------------------------------------------------------------
info "Secret suite-tls-cert (copia de dx-tls-cert)"
kubectl -n "$DX_NS" get secret dx-tls-cert >/dev/null 2>&1 || die "Falta dx-tls-cert en $DX_NS (Lab 1)"
apply_secret "$SUITE_NS" tls suite-tls-cert \
  --cert=<(secreto dx-tls-cert 'tls\.crt') --key=<(secreto dx-tls-cert 'tls\.key')

# --- 4. PVC con el WAR y el controlador JDBC --------------------------------------------------------------------------
export SUITE_NS SUITE_APP SUITE_PATH SUITE_LIBERTY_IMAGE SUITE_DB PG_HOST SC_RWO DX_HOST SUITE_CHECKSUM
SUITE_CHECKSUM=$(cat "$SALIDA/suite-api.war" "$SALIDA/orbita-mcp.war" "$SALIDA/postgresql.jar" "$K8S/server.xml" "$TMP"/*.xml "$TMP/ltpa.keys" | sha256sum | cut -c1-16)
VARS='$SUITE_NS $SUITE_APP $SUITE_PATH $SUITE_LIBERTY_IMAGE $SUITE_DB $PG_HOST $SC_RWO $DX_HOST $SUITE_CHECKSUM $SUITE_TZ $DX_ADMIN_GROUP $DX_BASIC_REGISTRY_REALM'
render "$K8S/suite-api.yaml" "$VARS" > "$TMP/suite-api.yaml"
actual=$(kubectl -n "$SUITE_NS" get deploy "$SUITE_APP" -o jsonpath='{.spec.template.metadata.annotations.suite-intranet/checksum}' 2>/dev/null || true)
if [[ "$actual" != "$SUITE_CHECKSUM" ]]; then
  info "Copiando suite-api.war, orbita-mcp.war y postgresql.jar al PVC ${SUITE_APP}-files"
  kubectl -n "$SUITE_NS" scale deploy "$SUITE_APP" --replicas=0 >/dev/null 2>&1 || true   # PVC RWO libre
  kubectl apply -f <(awk '/^---/{exit} {print}' "$TMP/suite-api.yaml")                    # solo el PVC
  kubectl -n "$SUITE_NS" delete pod "${SUITE_APP}-carga" --ignore-not-found --wait >/dev/null
  kubectl -n "$SUITE_NS" run "${SUITE_APP}-carga" --image=busybox:1.37.0 --restart=Never \
    --overrides="{\"spec\":{\"containers\":[{\"name\":\"carga\",\"image\":\"busybox:1.37.0\",\"command\":[\"sleep\",\"600\"],
      \"volumeMounts\":[{\"name\":\"f\",\"mountPath\":\"/suite\"}]}],
      \"volumes\":[{\"name\":\"f\",\"persistentVolumeClaim\":{\"claimName\":\"${SUITE_APP}-files\"}}]}}" >/dev/null
  kubectl -n "$SUITE_NS" wait --for=condition=Ready "pod/${SUITE_APP}-carga" --timeout=180s >/dev/null
  for f in suite-api.war orbita-mcp.war postgresql.jar; do
    kubectl -n "$SUITE_NS" cp "$SALIDA/$f" "${SUITE_APP}-carga:/suite/$f.tmp"
    kubectl -n "$SUITE_NS" exec "${SUITE_APP}-carga" -- sh -c "chmod 644 /suite/$f.tmp && mv /suite/$f.tmp /suite/$f"
  done
  kubectl -n "$SUITE_NS" delete pod "${SUITE_APP}-carga" --wait >/dev/null
else
  ok "El WAR y la configuración no han cambiado"
fi

# --- 5. Deployment, Service y ruta ----------------------------------------------------------------------------------
info "Deployment y Service $SUITE_APP ($SUITE_LIBERTY_IMAGE)"
kubectl apply -f "$TMP/suite-api.yaml"
case "$INGRESS_CLASS" in
  traefik) render "$K8S/ruta-traefik.yaml" '$SUITE_NS $SUITE_APP $SUITE_PATH $DX_HOST' | kubectl apply -f - ;;
  nginx)   render "$K8S/ruta-nginx.yaml"   '$SUITE_NS $SUITE_APP $SUITE_PATH $DX_HOST' | kubectl apply -f - ;;
  *)       die "INGRESS_CLASS=$INGRESS_CLASS no soportado (traefik o nginx)" ;;
esac
info "NetworkPolicy ${SUITE_APP}-mcp: el puerto del MCP (9081) solo para ${IQ_RELEASE}-integrator ($DX_NS)"
export IQ_RELEASE
render "$K8S/networkpolicy.yaml" '$SUITE_NS $SUITE_APP $DX_NS $IQ_RELEASE' | kubectl apply -f -
kubectl -n "$SUITE_NS" rollout status deploy "$SUITE_APP" --timeout=10m

info "Prueba: https://$DX_HOST$SUITE_PATH/publico"
for i in $(seq 1 12); do   # Traefik tarda unos segundos en ver el nuevo endpoint
  r=$(curl -sk -m 10 "https://$DX_HOST$SUITE_PATH/publico" || true)
  [[ "$r" == *suite-api* ]] && break; sleep 5
done
[[ "$r" == *suite-api* ]] && ok "$r" || warn "No responde por el Ingress (¿resuelve $DX_HOST desde aquí?): $r"
echo "Siguiente: k8s/05-scriptapps.sh"
