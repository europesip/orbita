#!/usr/bin/env bash
# ÓRBITA · instalar (o actualizar) el chart hcl-dx-orbita en el entorno de los labs de HCL DX Compose.
#
# Usa el env.sh de los labs (DX_NS, SHARED_NS, DX_HOST, PG_HOST, WPSADMIN_PASSWORD...): exporta DX_LABS con su carpeta
# o deja este repositorio junto a hcl-dx-compose-labs. Requisitos en el clúster: Lab 1 (DX), PostgreSQL de las
# dependencias externas (o Lab 2B) y, para entrar con los usuarios de la demo, el OpenLDAP del Lab 2A.
#
#   DXCLIENT_ACCEPT_LICENSE=yes   aceptas la licencia de HCL DXClient (como en el Lab 1B)
#   ORBITA_CHART                  chart a instalar: por defecto el de este repositorio (chart/hcl-dx-orbita);
#                                 o oci://ghcr.io/europesip/charts/hcl-dx-orbita con ORBITA_CHART_VERSION
#
# Los parámetros que se le pasen van a helm (p. ej. --set demo.seed=false).
set -euo pipefail
ORBITA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${DX_LABS:-}" ]]; then
  for d in "$ORBITA_DIR/../hcl-dx-compose-labs" "$ORBITA_DIR/../dx-compose-webinar"; do
    [[ -f "$d/env.sh" ]] && { DX_LABS="$(cd "$d" && pwd)"; break; }
  done
fi
[[ -f "${DX_LABS:-}/env.sh" ]] || { echo "No encuentro el env.sh de los labs: exporta DX_LABS con su carpeta" >&2; exit 1; }
# shellcheck disable=SC1091
source "$DX_LABS/common/lib.sh"     # info/ok/warn/die, apply_secret y env.sh
require_cmd helm kubectl
require_vars DX_NS SHARED_NS DX_HOST PG_HOST WPSADMIN_PASSWORD

RELEASE="${ORBITA_RELEASE:-orbita}"
CHART="${ORBITA_CHART:-$ORBITA_DIR/chart/hcl-dx-orbita}"
[[ "${DXCLIENT_ACCEPT_LICENSE:-}" == yes ]] || die "Lee la licencia de DXClient y pon DXCLIENT_ACCEPT_LICENSE=yes para aceptarla:
  kubectl -n $SHARED_NS run dxclient-license --rm -i --restart=Never --image=${DXCLIENT_IMAGE:-hclcr.io/dx-public/dxclient:v95_CF239_20261103-1404} --command -- /dxclient/bin/dxclient accept-license"
kubectl -n "$DX_NS" get secret dx-tls-cert >/dev/null 2>&1 || die "Falta dx-tls-cert en $DX_NS: haz antes el Lab 1"
kubectl -n "$SHARED_NS" get secret dx-pg-superuser >/dev/null 2>&1 || die "Falta dx-pg-superuser en $SHARED_NS: instala PostgreSQL (external-deps/02-postgres.sh)"

# Usuario de DX para DXClient (sube las Script Applications y crea las páginas con XMLAccess: hace falta un
# administrador; en el lab, wpsadmin) y la CA del certificado de DX (autofirmado en el lab: es su propia CA). La CA
# también la usa la API para preguntar a DX quién es el usuario.
info "Secrets orbita-dx (usuario de DX) y orbita-dx-ca (CA del certificado de DX) en $SHARED_NS"
apply_secret "$SHARED_NS" generic orbita-dx --from-literal=username=wpsadmin --from-literal=password="$WPSADMIN_PASSWORD"
CA=$(mktemp); trap 'rm -f "$CA"' EXIT
kubectl -n "$DX_NS" get secret dx-tls-cert -o jsonpath='{.data.tls\.crt}' | base64 -d > "$CA"
apply_secret "$SHARED_NS" generic orbita-dx-ca --from-file=ca.crt="$CA"

# Las imágenes y el chart son públicos. Si existe un secret ghcr-pull (instalaciones anteriores), se sigue usando.
PULL=()
if kubectl -n "$SHARED_NS" get secret ghcr-pull >/dev/null 2>&1; then
  PULL=(--set 'imagePullSecrets[0].name=ghcr-pull' --set 'scriptapps.job.imagePullSecrets[0].name=ghcr-pull')
fi

VER=()
if [[ -d "$CHART" ]]; then
  info "Dependencias del chart (hcl-dx-scriptapp)"
  helm dependency build "$CHART" >/dev/null
else
  VER=(--version "${ORBITA_CHART_VERSION:?falta ORBITA_CHART_VERSION}")
fi

info "helm upgrade --install $RELEASE ($CHART) en $SHARED_NS"
helm upgrade --install "$RELEASE" "$CHART" "${VER[@]}" -n "$SHARED_NS" --timeout 15m \
  --set dx.host="$DX_HOST" --set dx.caSecret=orbita-dx-ca \
  --set database.host="$PG_HOST" --set database.create.superuserSecret=dx-pg-superuser \
  --set mcp.networkPolicy.integratorNamespace="$DX_NS" \
  --set scriptapps.dx.host="$DX_HOST" --set scriptapps.dx.credentialsSecret=orbita-dx --set scriptapps.dx.caSecret=orbita-dx-ca \
  --set scriptapps.dxclient.acceptLicense=true \
  ${DXCLIENT_IMAGE:+--set scriptapps.dxclient.image="$DXCLIENT_IMAGE"} \
  "${PULL[@]}" "$@"
kubectl -n "$SHARED_NS" rollout status deploy/"$RELEASE"-api --timeout=10m
kubectl -n "$SHARED_NS" logs job/"$RELEASE"-scriptapps-push -c dxclient | tail -3
echo
echo "Páginas: https://$DX_HOST/wps/myportal/Home/{mi-intranet,fichaje,vacaciones,gastos,aprobaciones,comunicacion,quiosco}"
echo "Asistente de IA (opcional): scripts/registrar-mcp-en-iq.sh   ·   Comprobar: scripts/verificar.sh"
