# Shared library client

Framework-independent Supabase adapter used by Girih, Bricks, Muqarnas, and
Mehraz. Editors provide their native JSON payload; the adapter handles stable
asset identities, immutable versions, ownership, and actionable migration
errors.

Phase 3 supports:

- listing accessible assets by type;
- creating an asset and its first version atomically;
- saving a new version of an owned asset;
- archiving without destroying version history.
