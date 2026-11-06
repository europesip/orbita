#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 6 (cuando el MCP esté listo) · Registrar el servidor MCP de ÓRBITA en DX IQ.
#
# El Integrator de DX IQ lee la lista de servidores MCP (URL base separadas por comas; él añade /mcp y /probe/ready)
# de la clave dx.config.integrator.mcp_server_list del ConfigMap <IQ_RELEASE>-integrator (Lab 3B, issues.md).
# Este script AÑADE la URL de ÓRBITA a la lista actual (no quita el MCP de HCL ni el de EUROPESIP), reinicia el
# Integrator y muestra las herramientas que ha cargado. Repetirlo no duplica la entrada.
#
# OJO: un "helm upgrade" de IQ (lab3 04-iq-install.sh) regenera la lista y solo vuelve a añadir el MCP de EUROPESIP:
# después de actualizar IQ, ejecuta otra vez este script.
#
# Equivalente manual:  kubectl -n dx-demo patch configmap dx-iq-integrator --type merge -p \
#   '{"data":{"dx.config.integrator.mcp_server_list":"<lista actual>,http://suite-api.dx-shared.svc.cluster.local:9081"}}'
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd kubectl
require_vars DX_NS IQ_RELEASE SUITE_NS SUITE_APP
CM="${IQ_RELEASE}-integrator"
ORBITA="http://${SUITE_APP}.${SUITE_NS}.svc.cluster.local:9081"

kubectl -n "$SUITE_NS" get svc "$SUITE_APP" >/dev/null 2>&1 || die "No existe el servicio $SUITE_APP en $SUITE_NS (k8s/04-api.sh)"
kubectl -n "$DX_NS" get configmap "$CM" >/dev/null 2>&1 || die "No existe el ConfigMap $CM: ¿está instalado DX IQ (Lab 3)?"

ACTUAL=$(kubectl -n "$DX_NS" get configmap "$CM" -o jsonpath='{.data.dx\.config\.integrator\.mcp_server_list}')
info "Lista actual: ${ACTUAL:-(vacía)}"
if [[ ",$ACTUAL," == *",$ORBITA,"* ]]; then
  ok "ÓRBITA ya está registrado"
else
  LISTA="${ACTUAL:+$ACTUAL,}$ORBITA"
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
echo "Prueba en el chat de IQ:  ¿Cuántos días de vacaciones le quedan a lucia.martin?"
