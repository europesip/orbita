# Publicación en Artifact Hub

[English](artifact-hub.md) · **Español**

El chart está publicado en [Artifact Hub](https://artifacthub.io) (issue #30), el buscador de la CNCF para paquetes de
Kubernetes. Artifact Hub lee el repositorio OCI `oci://ghcr.io/europesip/charts/hcl-dx-orbita` y muestra, para cada
versión del chart, el `README.md` del chart, el icono, las capturas y las anotaciones `artifacthub.io/*` de `Chart.yaml`.

| Qué | Fichero |
|---|---|
| Página del paquete | `chart/hcl-dx-orbita/README.md` (va dentro del chart) |
| Icono, enlaces, mantenedores, categoría, capturas | `chart/hcl-dx-orbita/Chart.yaml` |
| Imágenes y cambios de cada versión | `artifacthub.io/images` y `artifacthub.io/changes` en `Chart.yaml` |
| Publicador verificado | `hack/artifacthub/artifacthub-repo.yml`, subido con la etiqueta `artifacthub.io` |

## En cada versión

1. En `Chart.yaml`, poner en `artifacthub.io/images` las etiquetas de imagen del nuevo `appVersion`.
2. Sustituir `artifacthub.io/changes` por las entradas de la nueva versión del `CHANGELOG.md`
   (`kind`: added, changed, deprecated, removed, fixed o security).
3. Poner `artifacthub.io/containsSecurityUpdates: "true"` si la versión corrige una vulnerabilidad.

## Publicador verificado (una vez)

Cuando el repositorio exista en Artifact Hub, copiar su ID de la tarjeta del repositorio en
`hack/artifacthub/artifacthub-repo.yml` y subirlo junto al chart:

```bash
oras push ghcr.io/europesip/charts/hcl-dx-orbita:artifacthub.io \
  --config /dev/null:application/vnd.cncf.artifacthub.config.v1+yaml \
  hack/artifacthub/artifacthub-repo.yml:application/vnd.cncf.artifacthub.repository-metadata.layer.v1.yaml
```
