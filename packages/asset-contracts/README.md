# Girih Studio Asset Contracts

Versioned data contracts shared by Girih App, Bricks App, Muqarnas App, and Mehraz App.

## Rules

- Physical dimensions use metres.
- Coordinates are right-handed and Y-up, with -Z as forward.
- Every library save creates an immutable asset version.
- Mehraz placements pin a specific `assetVersionId`.
- Mehraz façade zones and construction assemblies are optional, backward-compatible project fields.
- Mehraz owns architectural wall geometry and may persist side offsets/heights, openings, pointed arches, north-wall recesses, edge styles, and version-pinned per-wall brick bonds in `payload.walls`.
- Mehraz projects may also persist authored spotlights in `payload.nightLights`; export settings remain editor-local.
- Assembly schedules reference placement IDs and may be exported as CSV without duplicating source assets.
- Unknown fields are preserved for forward compatibility.
- Breaking changes require a new contract version.

Run `npm run test:asset-contracts` from the repository root.
