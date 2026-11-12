# The PostgreSQL of the DX persistence (database.type: dxPersistence)

Issue: #8 · Status: Implemented · Release: next

## Summary
Option to keep the ÓRBITA data in the PostgreSQL that HCL DX installs for DAM (`persistence-node`), instead of an
external PostgreSQL, with values modelled on the `configuration.database` block of the hcl-dx-iq chart.

## Current behaviour
`database.host` and `database.create.superuserSecret` are required (`templates/deployment.yaml`, `templates/job-db.yaml`).

## Specification
- `database.type`: `external` (default; renders exactly as 3.1.2) or `dxPersistence`; any other value fails.
- `dxPersistence`: host `<release>-persistence-headless-svc` (with `.<namespace>.svc.cluster.local` when
  `database.dxPersistence.namespace` is another namespace), port 5432, `sslMode: disable`; superuser
  `database.dxPersistence.superuserSecret` or, in the DX namespace, `<release>-persistence-user`. In another namespace
  without `superuserSecret` the chart fails with the copy instructions.
- Why the headless service: the DX connection pool (pgpool) only accepts the users of its `pool_passwd`.
- Limits (README EN/ES): PostgreSQL 16, no TLS, managed by DX, one replica; recommended in the DX namespace; a copied
  Secret is not updated when DX changes the password.
- Also: the DX session cookie with OIDC can be `WAS_n...` or `WAS_p...`: `WAS_*` in the API default, the chart default
  and the theme step.

## Acceptance criteria
- [x] `type: external`: `helm template` identical to main (except the random kiosk key and database password).
- [x] `type: dxPersistence`, ÓRBITA in `europesip`, DX in `digital-experience`: Job creates `orbita`, Flyway V1+V2,
      API ready.
- [x] Apps on that DX with its LDAP users signed in through Keycloak: `/v1/yo`, pages with the theme, a time mark.
- [x] Unknown `type`: clear error.

## Out of scope
Release, labs/installer integration, IQ registration.

## Test plan
helm template diff against main; install on the k3s `digital-experience` environment (CF239, persistence PG 16.15).
