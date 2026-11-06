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

{{- define "orbita.dxUrl" -}}
{{- .Values.dx.url | default (printf "https://%s" (required "dx.host is required (public host name of DX)" .Values.dx.host)) -}}
{{- end -}}
