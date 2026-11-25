# List the chart on Artifact Hub

Issue: #30 · Status: Implemented · Release: next chart version

## Summary
List the ÓRBITA Helm chart on Artifact Hub with a useful page (README, icon, screenshots, images, links, changelog) and
the "Verified publisher" label.

## Specification
- `Chart.yaml`: `icon`; annotations `artifacthub.io/{license,category,prerelease,containsSecurityUpdates,links,
  maintainers,images,changes,screenshots}`.
- `chart/hcl-dx-orbita/README.md` (+ `.es.md`) packaged with the chart.
- `hack/artifacthub/artifacthub-repo.yml` pushed to `ghcr.io/europesip/charts/hcl-dx-orbita:artifacthub.io` with oras
  once the repository ID is known.
- Release checklist in `docs/artifact-hub.md`.

## Acceptance criteria
- [x] `helm lint` / `helm template` pass; the packaged chart contains `README.md`.
- [ ] The Artifact Hub page shows README, icon, screenshots, images, links and changes after the next published version.
- [ ] "Verified publisher" after pushing `artifacthub-repo.yml`.

## Out of scope
Other charts; Official status; creating the Artifact Hub account (Andrés).
