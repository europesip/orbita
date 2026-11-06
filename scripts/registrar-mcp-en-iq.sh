#!/usr/bin/env bash
# ÓRBITA · registrar el servidor MCP de ÓRBITA en HCL DX IQ (laboratorio).
#
# El Integrator de DX IQ lee la lista de servidores MCP (URL base separadas por comas; él añade /mcp y /probe/ready) de
# la clave dx.config.integrator.mcp_server_list del ConfigMap <IQ_RELEASE>-integrator. El chart de IQ no permite
# ampliarla (caso CS1479102 de HCL, issues.md de los labs): este script AÑADE la URL de ÓRBITA a la lista actual (sin
# quitar el MCP de HCL ni otros), reinicia el Integrator y muestra las herramientas que ha cargado. Repetirlo no
# duplica la entrada. Un "helm upgrade" de IQ regenera la lista: después, ejecútalo otra vez.
set -euo pipefail
ORBITA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${DX_LABS:-}" ]]; then
  for d in "$ORBITA_DIR/../hcl-dx-compose-labs" "$ORBITA_DIR/../dx-compose-webinar"; do
    [[ -f "$d/env.sh" ]] && { DX_LABS="$(cd "$d" && pwd)"; break; }
  done
fi
[[ -f "${DX_LABS:-}/env.sh" ]] || { echo "No encuentro el env.sh de los labs: exporta DX_LABS con su carpeta" >&2; exit 1; }
# shellcheck disable=SC1091
source "$DX_LABS/common/lib.sh"
require_cmd kubectl
require_vars DX_NS SHARED_NS IQ_RELEASE
RELEASE="${ORBITA_RELEASE:-orbita}"
CM="${IQ_RELEASE}-integrator"
URL="http://${RELEASE}-api.${SHARED_NS}.svc.cluster.local:9081"

kubectl -n "$SHARED_NS" get svc "$RELEASE"-api >/dev/null 2>&1 || die "No existe el servicio $RELEASE-api en $SHARED_NS: instala ÓRBITA (scripts/instalar-en-labs.sh)"
kubectl -n "$DX_NS" get configmap "$CM" >/dev/null 2>&1 || die "No existe el ConfigMap $CM: ¿está instalado DX IQ (Lab 3)?"

ACTUAL=$(kubectl -n "$DX_NS" get configmap "$CM" -o jsonpath='{.data.dx\.config\.integrator\.mcp_server_list}')
info "Lista actual: ${ACTUAL:-(vacía)}"
if [[ ",$ACTUAL," == *",$URL,"* ]]; then
  ok "ÓRBITA ya está registrado"
else
  LISTA="${ACTUAL:+$ACTUAL,}$URL"
  info "Nueva lista: $LISTA"
  kubectl -n "$DX_NS" patch configmap "$CM" --type merge -p "{\"data\":{\"dx.config.integrator.mcp_server_list\":\"$LISTA\"}}"
fi

info "Reiniciando el Integrator para que cargue las herramientas"
kubectl -n "$DX_NS" rollout restart deployment/"$CM"
kubectl -n "$DX_NS" rollout status deployment/"$CM" --timeout=300s
sleep 15
P=$(kubectl -n "$DX_NS" get pods -l app="$CM" --field-selector=status.phase=Running \
     --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
kubectl -n "$DX_NS" logs "$P" | grep -oE "Fetched [0-9]+ tools from [^ ]+|Total tools: [0-9]+" | sort -u | sed 's/^/  /'
echo "Prueba en el chat de IQ, con un usuario de la demo:  ¿Cuántos días de vacaciones me quedan?"
