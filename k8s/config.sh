#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · configuración común de los scripts de k8s/ (se carga con source).
#
# Reutiliza el env.sh de los labs de DX Compose (DX_NS, SHARED_NS, DX_HOST, PG_CLUSTER, LDAP_RELEASE...):
# la suite se instala sobre ese entorno. Exporta DX_LABS con la carpeta de los labs; si no, se busca junto a esta.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${DX_LABS:-}" ]]; then
  for d in "$SUITE_DIR/../hcl-dx-compose-labs" "$SUITE_DIR/../hcl-dx-compose-labs-main" "$SUITE_DIR/../Github_Andres/hcl-dx-compose-labs-main"; do
    [[ -f "$d/env.sh" ]] && { DX_LABS="$(cd "$d" && pwd)"; break; }
  done
fi
DX_LABS="${DX_LABS:-}"
[[ -f "$DX_LABS/env.sh" ]] || { echo "No encuentro $DX_LABS/env.sh: exporta DX_LABS con la carpeta de los labs" >&2; exit 1; }
# shellcheck disable=SC1091
source "$DX_LABS/common/lib.sh"    # info/ok/warn/fail/die, apply_secret, carga env.sh

# --- Suite --------------------------------------------------------------------------------------------------------
SUITE_NS="${SUITE_NS:-$SHARED_NS}"                       # software que no es de HCL: en dx-shared, como en los labs
SUITE_APP="${SUITE_APP:-suite-api}"                      # Deployment, Service y ruta /suite-api
SUITE_PATH="${SUITE_PATH:-/suite-api}"
SUITE_LIBERTY_IMAGE="${SUITE_LIBERTY_IMAGE:-icr.io/appcafe/open-liberty:26.0.0.8-full-java21-openj9-ubi-minimal}"  # misma versión que la WebEngine de CF238
SUITE_USERS_PASSWORD="${SUITE_USERS_PASSWORD:-demo1234}" # usuarios de la suite en el OpenLDAP del Lab 2A
SUITE_DB="${SUITE_DB:-suite_intranet}"                   # base de datos en el cluster PostgreSQL del Lab 2B
SUITE_DB_USER="${SUITE_DB_USER:-suiteuser}"
SUITE_DB_PASSWORD="${SUITE_DB_PASSWORD:-}"                # vacía: 03-base-datos.sh reutiliza la del secret suite-db o genera una
# Páginas de DX con las Script Applications (padre y URLs que usan los enlaces entre aplicaciones)
SUITE_PARENT_PAGE="${SUITE_PARENT_PAGE:-ibm.portal.Home}"
SUITE_PAGINAS="${SUITE_PAGINAS:-/wps/myportal/Home/}"
SUITE_QUIOSCO="${SUITE_QUIOSCO:-/wps/myportal/Home/quiosco}"   # solo autenticados
DXCLIENT_IMAGE="${DXCLIENT_IMAGE:-hclcr.io/dx-compose/dxclient:v95_CF238_20260915-2024}"

HERRAMIENTAS="$SUITE_DIR/.herramientas"   # JDK portable y JAR de compilación (los descarga 01-construir.sh)
SALIDA="$SUITE_DIR/build/k8s"             # artefactos generados
