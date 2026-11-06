#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 3 · Base de datos de la suite en el PostgreSQL 18 del Lab 2B.
#
# Crea en el cluster CloudNativePG $PG_CLUSTER (dx-shared) el usuario $SUITE_DB_USER y la base de datos $SUITE_DB, de su
# propiedad, y el secret suite-db con las credenciales para el servicio REST. Las tablas no se crean aquí: las crea
# suite-api (Db.java) en el primer acceso, con los datos de demostración.
# No toca dx_core (la base de datos del Web Engine) ni la definición del cluster del lab.
#
# Equivalente manual (como postgres):  CREATE ROLE suiteuser LOGIN PASSWORD '...';
#                                      CREATE DATABASE suite_intranet OWNER suiteuser ENCODING 'UTF8';
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd kubectl
require_vars SHARED_NS PG_CLUSTER SUITE_NS SUITE_DB SUITE_DB_USER

# Contraseña: la de SUITE_DB_PASSWORD; si no se da, la que ya tiene el secret suite-db; si no existe, una aleatoria.
# No se escribe en ningún fichero: solo en PostgreSQL y en el secret.
if [[ -z "${SUITE_DB_PASSWORD:-}" ]]; then
  SUITE_DB_PASSWORD=$(kubectl -n "$SUITE_NS" get secret suite-db -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || true)
  if [[ -z "$SUITE_DB_PASSWORD" ]]; then
    SUITE_DB_PASSWORD=$(python3 -I -c 'import secrets; print(secrets.token_urlsafe(24))')
    info "Contraseña nueva y aleatoria para $SUITE_DB_USER (queda en el secret suite-db)"
  fi
fi

PRIMARY=$(kubectl -n "$SHARED_NS" get pod -l "cnpg.io/cluster=$PG_CLUSTER,cnpg.io/instanceRole=primary" -o name | head -1)
[[ -n "$PRIMARY" ]] || die "No encuentro la instancia primaria de $PG_CLUSTER en $SHARED_NS (Lab 2B, paso 3)"

info "Usuario $SUITE_DB_USER y base de datos $SUITE_DB en $PG_CLUSTER ($PRIMARY)"
# El SQL (con la contraseña) va por stdin, no en la línea de órdenes. \gexec ejecuta el CREATE solo si falta.
kubectl -n "$SHARED_NS" exec -i "$PRIMARY" -c postgres -- psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SELECT 'CREATE ROLE "$SUITE_DB_USER" LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$SUITE_DB_USER')\gexec
ALTER ROLE "$SUITE_DB_USER" WITH LOGIN PASSWORD '${SUITE_DB_PASSWORD//\'/\'\'}';
SELECT 'CREATE DATABASE "$SUITE_DB" OWNER "$SUITE_DB_USER" ENCODING ''UTF8'' TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$SUITE_DB')\gexec
REVOKE ALL ON DATABASE "$SUITE_DB" FROM PUBLIC;
SQL
ok "$SUITE_DB lista (propietario $SUITE_DB_USER)"

info "Secret suite-db en $SUITE_NS"
apply_secret "$SUITE_NS" generic suite-db \
  --from-literal=username="$SUITE_DB_USER" --from-literal=password="$SUITE_DB_PASSWORD"
echo "Desde suite-api: jdbc:postgresql://${PG_HOST}:5432/${SUITE_DB}"
echo "Siguiente: k8s/04-api.sh"
