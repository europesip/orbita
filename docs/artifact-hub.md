# Artifact Hub listing

**English** · [Español](artifact-hub.es.md)

The chart is listed on [Artifact Hub](https://artifacthub.io) (issue #30), the CNCF hub for Kubernetes packages. Artifact
Hub reads the OCI repository `oci://ghcr.io/europesip/charts/hcl-dx-orbita` and shows, for each chart version, the
chart `README.md`, the icon, the screenshots and the `artifacthub.io/*` annotations of `Chart.yaml`.

| What | File |
|---|---|
| Page of the package | `chart/hcl-dx-orbita/README.md` (packaged with the chart) |
| Icon, links, maintainers, category, screenshots | `chart/hcl-dx-orbita/Chart.yaml` |
| Images and changes of each version | `artifacthub.io/images` and `artifacthub.io/changes` in `Chart.yaml` |
| Verified publisher | `hack/artifacthub/artifacthub-repo.yml`, pushed with the tag `artifacthub.io` |

## With every release

1. In `Chart.yaml`, set the image tags of `artifacthub.io/images` to the new `appVersion`.
2. Replace `artifacthub.io/changes` with the entries of the new version in `CHANGELOG.md`
   (`kind`: added, changed, deprecated, removed, fixed or security).
3. Set `artifacthub.io/containsSecurityUpdates: "true"` if the release fixes a vulnerability.

## Verified publisher (once)

When the repository exists on Artifact Hub, copy its ID from the repository card into
`hack/artifacthub/artifacthub-repo.yml` and push it next to the chart:

```bash
oras push ghcr.io/europesip/charts/hcl-dx-orbita:artifacthub.io \
  --config /dev/null:application/vnd.cncf.artifacthub.config.v1+yaml \
  hack/artifacthub/artifacthub-repo.yml:application/vnd.cncf.artifacthub.repository-metadata.layer.v1.yaml
```
