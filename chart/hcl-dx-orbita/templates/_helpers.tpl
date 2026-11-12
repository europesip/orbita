{{- define "orbita.fullname" -}}
{{- if contains "orbita" .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-orbita" .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "orbita.labels" -}}
app.kubernetes.io/name: orbita
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "orbita.selector" -}}
app.kubernetes.io/name: orbita
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end -}}

{{/* Secret with the ÓRBITA database user (existing or created by the chart) */}}
{{- define "orbita.dbSecret" -}}
{{- .Values.database.existingSecret | default (printf "%s-db" (include "orbita.fullname" .)) -}}
{{- end -}}

{{/* Database connection: an external PostgreSQL (database.host...) or the persistence of HCL DX (database.type=dxPersistence) */}}
{{- define "orbita.dbType" -}}
{{- $t := .Values.database.type | default "external" -}}
{{- if not (has $t (list "external" "dxPersistence")) -}}
{{- fail (printf "database.type must be external or dxPersistence (got %q)" $t) -}}
{{- end -}}
{{- $t -}}
{{- end -}}

{{/* DX persistence: straight to the PostgreSQL node (headless service). The DX connection pool (pgpool) only accepts
     the users of its pool_passwd, so a new user like orbita cannot go through it. */}}
{{- define "orbita.dbHost" -}}
{{- if eq (include "orbita.dbType" .) "dxPersistence" -}}
{{- $p := .Values.database.dxPersistence -}}
{{- $svc := printf "%s-persistence-headless-svc" (required "database.dxPersistence.release is required (release of hcl-dx-deployment)" $p.release) -}}
{{- if and $p.namespace (ne $p.namespace .Release.Namespace) -}}
{{- printf "%s.%s.svc.cluster.local" $svc $p.namespace -}}
{{- else -}}
{{- $svc -}}
{{- end -}}
{{- else -}}
{{- required "database.host is required (PostgreSQL host), or set database.type=dxPersistence" .Values.database.host -}}
{{- end -}}
{{- end -}}

{{- define "orbita.dbPort" -}}
{{- if eq (include "orbita.dbType" .) "dxPersistence" -}}5432{{- else -}}{{ .Values.database.port }}{{- end -}}
{{- end -}}

{{/* The DX persistence has no TLS */}}
{{- define "orbita.dbSslMode" -}}
{{- if eq (include "orbita.dbType" .) "dxPersistence" -}}disable{{- else -}}{{ .Values.database.sslMode }}{{- end -}}
{{- end -}}

{{/* Superuser for the database Job. DX persistence: its superuser Secret <release>-persistence-user (username/password),
     which only exists in the DX namespace: in another namespace give a copy in database.dxPersistence.superuserSecret */}}
{{- define "orbita.dbSuperuserSecret" -}}
{{- if eq (include "orbita.dbType" .) "dxPersistence" -}}
{{- $p := .Values.database.dxPersistence -}}
{{- if $p.superuserSecret -}}
{{- $p.superuserSecret -}}
{{- else if and $p.namespace (ne $p.namespace .Release.Namespace) -}}
{{- fail (printf "database.dxPersistence.superuserSecret is required: ÓRBITA (namespace %s) cannot read %s-persistence-user of namespace %s; copy it to %s and give its name" .Release.Namespace $p.release $p.namespace .Release.Namespace) -}}
{{- else -}}
{{- printf "%s-persistence-user" $p.release -}}
{{- end -}}
{{- else -}}
{{- required "database.create.superuserSecret is required (Secret with a PostgreSQL superuser), or set database.create.enabled=false" .Values.database.create.superuserSecret -}}
{{- end -}}
{{- end -}}

{{- define "orbita.dxUrl" -}}
{{- .Values.dx.url | default (printf "https://%s" (required "dx.host is required (public host name of DX)" .Values.dx.host)) -}}
{{- end -}}
