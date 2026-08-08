# Phase 2: shared asset library

This migration creates the private, versioned library used by Girih App,
Bricks App, Muqarnas App, and Mehraz App.

## Install

1. Open the same Supabase project already used by Girih Studio.
2. Open **SQL Editor** and create a new query.
3. Paste the complete contents of
   `migrations/202607270001_shared_asset_library.sql`.
4. Run the query once. The migration is idempotent and is safe to run again.
5. Open `https://girihstudio.com/mehraz-foundation`.
6. The status changes from **Migration ready** to **Phase 2 operational**.

## What it creates

- `library_assets`: stable ownership and metadata.
- `library_asset_versions`: immutable contract-versioned snapshots.
- `library_asset_entitlements`: sharing and marketplace access.
- `library-assets`: private artifact storage bucket.
- Owner and entitlement row-level security policies.
- An atomic `create_library_asset_version` function.

Artifact paths follow:

`{owner_uuid}/{asset_uuid}/{version_uuid}/{filename}`

Phase 2 does not yet change any editor. Save/Open integrations belong to Phase 3.
