const CONTRACT_ID = 'girihstudio.library-asset';
const CONTRACT_VERSION = 1;

const APP_BY_TYPE = Object.freeze({
  girih_pattern: 'girih',
  brick_bond: 'bricks',
  muqarnas_assembly: 'muqarnas',
  surface_sticker: 'girih',
  mehraz_project: 'mehraz',
});

function libraryError(error, fallback) {
  const missing = error?.code === '42P01'
    || error?.code === 'PGRST202'
    || error?.code === 'PGRST205';
  const message = missing
    ? 'The shared library is not installed yet. Run the Phase 2 migration in Supabase.'
    : error?.message || fallback;
  return Object.assign(new Error(message), { cause: error, code: error?.code });
}

function isMissingRpc(error) {
  return error?.code === 'PGRST202' || /function .* not found|schema cache/i.test(error?.message || '');
}

function isInvalidJwt(error) {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
  return /invalid jwt|unable to parse or verify signature|unrecognized jwt kid|jwt/i.test(message)
    && /invalid|unrecognized|verify|parse/i.test(message);
}

async function authenticatedUser(supabase) {
  if (!supabase) throw new Error('The shared Supabase client is unavailable.');
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isInvalidJwt(error)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new Error('Your saved sign-in token belonged to an older Supabase project. It has been cleared — please sign in again.');
    }
    throw libraryError(error, 'Your account could not be verified.');
  }
  if (!data?.user) throw new Error('Sign in before using your shared library.');
  return data.user;
}

function cleanName(value) {
  const name = String(value || '').trim().slice(0, 120);
  if (!name) throw new Error('Give this library item a name.');
  return name;
}

function assertAssetType(assetType, sourceApp) {
  const expectedApp = APP_BY_TYPE[assetType];
  if (!expectedApp) throw new Error(`Unsupported library asset type: ${assetType}`);
  if (sourceApp !== expectedApp) throw new Error(`${assetType} assets must be saved by ${expectedApp}.`);
}

export async function listLibraryAssets(supabase, { assetType } = {}) {
  const user = await authenticatedUser(supabase);
  let request = supabase
    .from('library_assets')
    .select('id,owner_id,asset_type,source_app,name,description,visibility,lifecycle_status,current_version_id,created_at,updated_at')
    .eq('lifecycle_status', 'active')
    .order('updated_at', { ascending: false });
  if (assetType) request = request.eq('asset_type', assetType);
  const { data: assets, error } = await request;
  if (error) throw libraryError(error, 'The shared library could not be loaded.');

  const versionIds = (assets || []).map((asset) => asset.current_version_id).filter(Boolean);
  let versions = [];
  if (versionIds.length) {
    const result = await supabase
      .from('library_asset_versions')
      .select('id,asset_id,version_number,contract_id,contract_version,payload,artifacts,metadata,created_at')
      .in('id', versionIds);
    if (result.error) throw libraryError(result.error, 'Library versions could not be loaded.');
    versions = result.data || [];
  }
  const versionById = new Map(versions.map((version) => [version.id, version]));
  return (assets || []).map((asset) => ({
    ...asset,
    owned: asset.owner_id === user.id,
    currentVersion: versionById.get(asset.current_version_id) || null,
  }));
}

export async function saveLibraryAsset(supabase, {
  assetId = null,
  assetType,
  sourceApp,
  name,
  description = '',
  visibility = 'private',
  payload,
  artifacts = {},
  metadata = {},
  contentHash = null,
}) {
  const user = await authenticatedUser(supabase);
  assertAssetType(assetType, sourceApp);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The editor did not provide a valid library payload.');
  }

  if (assetId) {
    const { data, error } = await supabase.rpc('create_library_asset_version', {
      target_asset_id: assetId,
      next_payload: payload,
      next_artifacts: artifacts,
      next_metadata: metadata,
      next_content_hash: contentHash,
    });
    if (error && isMissingRpc(error)) {
      return createVersionDirectly(supabase, user.id, assetId, payload, artifacts, metadata, contentHash);
    }
    if (error) throw libraryError(error, 'A new library version could not be saved.');
    return {
      assetId,
      versionId: data?.id,
      versionNumber: data?.version_number,
      updated: true,
    };
  }

  const { data, error } = await supabase.rpc('create_library_asset_with_version', {
    new_asset_type: assetType,
    new_source_app: sourceApp,
    new_name: cleanName(name),
    new_description: String(description || '').trim().slice(0, 2000),
    new_visibility: visibility,
    new_payload: payload,
    new_artifacts: artifacts,
    new_metadata: {
      contract: CONTRACT_ID,
      contractVersion: CONTRACT_VERSION,
      ...metadata,
    },
    new_content_hash: contentHash,
  });
  if (error && isMissingRpc(error)) {
    return createAssetDirectly(supabase, user.id, {
      assetType,
      sourceApp,
      name,
      description,
      visibility,
      payload,
      artifacts,
      metadata: {
        contract: CONTRACT_ID,
        contractVersion: CONTRACT_VERSION,
        ...metadata,
      },
      contentHash,
    });
  }
  if (error) throw libraryError(error, 'The item could not be saved to your shared library.');
  const result = Array.isArray(data) ? data[0] : data;
  return {
    assetId: result?.asset_id,
    versionId: result?.version_id,
    versionNumber: result?.version_number,
    updated: false,
  };
}

async function createVersionDirectly(supabase, userId, assetId, payload, artifacts, metadata, contentHash) {
  const current = await supabase
    .from('library_asset_versions')
    .select('version_number')
    .eq('asset_id', assetId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (current.error) throw libraryError(current.error, 'Library versions could not be checked.');
  const versionNumber = Number(current.data?.[0]?.version_number || 0) + 1;
  const inserted = await supabase
    .from('library_asset_versions')
    .insert({
      asset_id: assetId,
      version_number: versionNumber,
      payload,
      artifacts,
      metadata,
      content_hash: contentHash || null,
      created_by: userId,
    })
    .select('id,version_number')
    .single();
  if (inserted.error) throw libraryError(inserted.error, 'A new library version could not be saved.');
  const updated = await supabase
    .from('library_assets')
    .update({ current_version_id: inserted.data.id })
    .eq('id', assetId);
  if (updated.error) throw libraryError(updated.error, 'The library asset could not be updated.');
  return {
    assetId,
    versionId: inserted.data.id,
    versionNumber: inserted.data.version_number,
    updated: true,
  };
}

async function createAssetDirectly(supabase, ownerId, {
  assetType,
  sourceApp,
  name,
  description,
  visibility,
  payload,
  artifacts,
  metadata,
  contentHash,
}) {
  const asset = await supabase
    .from('library_assets')
    .insert({
      owner_id: ownerId,
      asset_type: assetType,
      source_app: sourceApp,
      name: cleanName(name),
      description: String(description || '').trim().slice(0, 2000),
      visibility,
    })
    .select('id')
    .single();
  if (asset.error) throw libraryError(asset.error, 'The item could not be saved to your shared library.');
  const version = await createVersionDirectly(supabase, ownerId, asset.data.id, payload, artifacts, metadata, contentHash);
  return { ...version, updated: false };
}

export async function archiveLibraryAsset(supabase, assetId) {
  await authenticatedUser(supabase);
  const { error } = await supabase
    .from('library_assets')
    .update({ lifecycle_status: 'archived' })
    .eq('id', assetId);
  if (error) throw libraryError(error, 'The library item could not be archived.');
}

export async function updateLibraryAssetMetadata(supabase, assetId, { name, description = '' } = {}) {
  await authenticatedUser(supabase);
  const { error } = await supabase
    .from('library_assets')
    .update({
      name: cleanName(name),
      description: String(description || '').trim().slice(0, 2000),
    })
    .eq('id', assetId);
  if (error) throw libraryError(error, 'The library item could not be renamed.');
}

export async function listLibraryAssetVersions(supabase, assetId) {
  await authenticatedUser(supabase);
  const { data, error } = await supabase
    .from('library_asset_versions')
    .select('id,asset_id,version_number,contract_id,contract_version,payload,artifacts,metadata,created_at')
    .eq('asset_id', assetId)
    .order('version_number', { ascending: false });
  if (error) throw libraryError(error, 'Library versions could not be loaded.');
  return data || [];
}

export async function setCurrentLibraryAssetVersion(supabase, assetId, versionId) {
  await authenticatedUser(supabase);
  const { error } = await supabase
    .from('library_assets')
    .update({ current_version_id: versionId })
    .eq('id', assetId);
  if (error) throw libraryError(error, 'The current library version could not be changed.');
}

export const LIBRARY_CONTRACT = Object.freeze({
  id: CONTRACT_ID,
  version: CONTRACT_VERSION,
  appByType: APP_BY_TYPE,
});
