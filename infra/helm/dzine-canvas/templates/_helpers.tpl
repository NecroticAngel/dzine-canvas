{{- define "dzine-canvas.fullname" -}}
dzine-canvas-{{ .Values.client }}
{{- end }}

{{- define "dzine-canvas.selectorLabels" -}}
app.kubernetes.io/name: dzine-canvas
app.kubernetes.io/instance: {{ .Values.client }}
{{- end }}

{{- define "dzine-canvas.labels" -}}
{{ include "dzine-canvas.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
