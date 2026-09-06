const CONTRACT_ID = 'girihstudio.library-asset';
const CONTRACT_VERSION = 1;
const LIBRARY_BUCKET = 'library-assets';
export const LIBRARY_PAGE_SIZE = 48;

const APP_BY_TYPE = Object.freeze({
  girih_pattern: 'girih', brick_bond: 'bricks', muqarnas_assembly: 'muqarnas',
  surface_sticker: 'girih', mehraz_project: 'mehraz',
});
const AUTH_CACHE_MS = 30_000;
const authenticatedUserCache = new WeakMap();

function timeoutError(label) {
  return Object.assign(new Error(`${label} timed out. Check your connection and try again.`), { code: 'LIBRARY_TIMEOUT' });
}
function abortError() {
  return Object.assign(new Error('The request was cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' });
}
function isRetryable(error) {
  const status = Number(error?.status || error?.statusCode || error?.cause?.status || 0);
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return error?.code === 'LIBRARY_TIMEOUT' || error?.name === 'TypeError' || status === 408
    || status === 429 || status >= 500 || /network|fetch|timeout|temporar|connection/i.test(message);
}
function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const id = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(abortError()); }, { once: true });
  });
}
async function requestWithPolicy(factory, { signal, label, timeoutMs = 8_000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw abortError();
    const controller = new AbortController();
    let cancelRequest;
    const cancellation = new Promise((_, reject) => { cancelRequest = reject; });
    const parentAbort = () => {
      controller.abort();
      cancelRequest(abortError());
    };
    signal?.addEventListener('abort', parentAbort, { once: true });
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(timeoutError(label));
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([factory(controller.signal), deadline, cancellation]);
      if (!result?.error || !isRetryable(result.error) || attempt === retries) return result;
      lastError = result.error;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      lastError = error;
      if (!isRetryable(lastError) || attempt === retries) throw lastError;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', parentAbort);
    }
    await delay(180 * (2 ** attempt), signal);
  }
  throw lastError || new Error(`${label} failed.`);
}
function withAbortSignal(request, signal) {
  return signal && typeof request?.abortSignal === 'function' ? request.abortSignal(signal) : request;
}
function libraryError(error, fallback) {
  const missing = error?.code === '42P01' || error?.code === 'PGRST202' || error?.code === 'PGRST205';
  const message = missing ? 'The shared library is not installed yet. Run the latest migrations in Supabase.' : error?.message || fallback;
  return Object.assign(new Error(message), { cause: error, code: error?.code, status: error?.status });
}
function isMissingRpc(error) {
  return error?.code === 'PGRST202' || /function .* not found|schema cache/i.test(error?.message || '');
}
function isMissingOptimizedColumn(error) {
  return ['42703', 'PGRST204'].includes(error?.code) || /thumbnail_path|version_retention_limit/i.test(error?.message || '');
}
function isInvalidJwt(error) {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
  return /invalid jwt|unable to parse or verify signature|unrecognized jwt kid|jwt/i.test(message)
    && /invalid|unrecognized|verify|parse/i.test(message);
}
async function authenticatedUser(supabase) {
  if (!supabase) throw new Error('The shared Supabase client is unavailable.');
  const cached = authenticatedUserCache.get(supabase);
  if (cached?.user && Date.now() - cached.checkedAt < AUTH_CACHE_MS) return cached.user;
  let response;
  try {
    response = await requestWithPolicy(() => supabase.auth.getUser(), {
      label: 'Account verification', timeoutMs: 8_000, retries: 1,
    });
  } catch (error) {
    throw libraryError(error, 'Your account could not be verified.');
  }
  const { data, error } = response || {};
  if (error) {
    if (isInvalidJwt(error)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new Error('Your saved sign-in token belonged to an older Supabase project. It has been cleared — please sign in again.');
    }
    throw libraryError(error, 'Your account could not be verified.');
  }
  if (!data?.user) throw new Error('Sign in before using your shared library.');
  authenticatedUserCache.set(supabase, { user: data.user, checkedAt: Date.now() });
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
function catalogueRequest(supabase, columns, { assetType, cursor, pageSize, signal }) {
  let request = supabase.from('library_assets').select(columns)
    .eq('lifecycle_status', 'active').order('updated_at', { ascending: false })
    .order('id', { ascending: false }).limit(pageSize + 1);
  if (assetType) request = request.eq('asset_type', assetType);
  if (cursor?.updatedAt && cursor?.id && typeof request.or === 'function') {
    request = request.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`);
  } else if (cursor?.updatedAt && typeof request.lt === 'function') request = request.lt('updated_at', cursor.updatedAt);
  return withAbortSignal(request, signal);
}
async function signedThumbnailUrls(supabase, assets, signal) {
  const paths = [...new Set(assets.map((asset) => asset.thumbnail_path).filter(Boolean))];
  if (!paths.length || !supabase.storage?.from) return new Map();
  try {
    const { data, error } = await requestWithPolicy(
      () => supabase.storage.from(LIBRARY_BUCKET).createSignedUrls(paths, 3600),
      { signal, label: 'Library thumbnails', retries: 1 },
    );
    if (error) return new Map();
    return new Map((data || []).map((item, index) => [item.path || paths[index], item.signedUrl || item.signedURL]));
  } catch { return new Map(); }
}

export async function listLibraryAssets(supabase, { assetType, cursor = null, pageSize = LIBRARY_PAGE_SIZE, signal } = {}) {
  const userPromise = authenticatedUser(supabase);
  const size = Math.max(1, Math.min(100, Number(pageSize) || LIBRARY_PAGE_SIZE));
  const modern = 'id,owner_id,asset_type,source_app,name,description,visibility,lifecycle_status,current_version_id,thumbnail_path,version_retention_limit,created_at,updated_at';
  const legacy = 'id,owner_id,asset_type,source_app,name,description,visibility,lifecycle_status,current_version_id,created_at,updated_at';
  let response = await requestWithPolicy(
    (attemptSignal) => catalogueRequest(supabase, modern, { assetType, cursor, pageSize: size, signal: attemptSignal }),
    { signal, label: 'Library catalogue' },
  );
  if (response.error && isMissingOptimizedColumn(response.error)) {
    response = await requestWithPolicy(
      (attemptSignal) => catalogueRequest(supabase, legacy, { assetType, cursor, pageSize: size, signal: attemptSignal }),
      { signal, label: 'Library catalogue' },
    );
  }
  const user = await userPromise;
  if (response.error) throw libraryError(response.error, 'The shared library could not be loaded.');
  const rows = response.data || [];
  const hasMore = rows.length > size;
  const assets = rows.slice(0, size).map((asset) => ({
    ...asset, thumbnail_path: asset.thumbnail_path || null,
    version_retention_limit: Number(asset.version_retention_limit) || 20,
  }));
  const versionIds = assets.map((asset) => asset.current_version_id).filter(Boolean);
  let versions = [];
  if (versionIds.length) {
    const result = await requestWithPolicy((attemptSignal) => withAbortSignal(supabase
      .from('library_asset_versions')
      .select('id,asset_id,version_number,contract_id,contract_version,metadata,created_at')
      .in('id', versionIds), attemptSignal), { signal, label: 'Current library versions' });
    if (result.error) throw libraryError(result.error, 'Current library versions could not be loaded.');
    versions = result.data || [];
  }
  const thumbnailUrls = await signedThumbnailUrls(supabase, assets, signal);
  const byId = new Map(versions.map((version) => [version.id, version]));
  const hydrated = assets.map((asset) => ({
    ...asset, owned: asset.owner_id === user.id,
    thumbnailUrl: thumbnailUrls.get(asset.thumbnail_path) || '',
    currentVersion: byId.get(asset.current_version_id) || null,
  }));
  const last = hydrated.at(-1);
  return { assets: hydrated, hasMore, nextCursor: hasMore && last ? { updatedAt: last.updated_at, id: last.id } : null };
}

export async function getLibraryAssetVersion(supabase, versionId, { signal } = {}) {
  if (!versionId) throw new Error('Choose a library version to load.');
  const [, result] = await Promise.all([authenticatedUser(supabase), requestWithPolicy((attemptSignal) => withAbortSignal(supabase
    .from('library_asset_versions')
    .select('id,asset_id,version_number,contract_id,contract_version,payload,artifacts,metadata,created_at')
    .eq('id', versionId).single(), attemptSignal), { signal, label: 'Library item' })]);
  if (result.error) throw libraryError(result.error, 'The library item could not be loaded.');
  return result.data;
}

export async function listLibraryAssetVersions(supabase, assetId, { signal, limit = 100 } = {}) {
  const size = Math.max(1, Math.min(100, Number(limit) || 100));
  const [, result] = await Promise.all([authenticatedUser(supabase), requestWithPolicy((attemptSignal) => withAbortSignal(supabase
    .from('library_asset_versions')
    .select('id,asset_id,version_number,contract_id,contract_version,metadata,created_at')
    .eq('asset_id', assetId).order('version_number', { ascending: false }).limit(size), attemptSignal),
  { signal, label: 'Library version history' })]);
  if (result.error) throw libraryError(result.error, 'Library versions could not be loaded.');
  return result.data || [];
}

export async function listLibraryAssetVersionsForAssets(supabase, assetIds, { signal } = {}) {
  const ids = [...new Set((assetIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const [, result] = await Promise.all([authenticatedUser(supabase), requestWithPolicy((attemptSignal) => withAbortSignal(supabase
    .from('library_asset_versions')
    .select('id,asset_id,version_number,contract_id,contract_version,metadata,created_at')
    .in('asset_id', ids).order('version_number', { ascending: false }), attemptSignal),
  { signal, label: 'Project version histories' })]);
  if (result.error) throw libraryError(result.error, 'Project library versions could not be loaded.');
  const grouped = Object.fromEntries(ids.map((id) => [id, []]));
  (result.data || []).forEach((version) => { if (grouped[version.asset_id]) grouped[version.asset_id].push(version); });
  return grouped;
}

async function writeRequest(factory, label) {
  return requestWithPolicy((signal) => withAbortSignal(factory(), signal), {
    label, timeoutMs: 12_000, retries: 0,
  });
}
export async function saveLibraryAsset(supabase, options) {
  const { assetId = null, assetType, sourceApp, name, description = '', visibility = 'private',
    payload, artifacts = {}, metadata = {}, contentHash = null } = options;
  const user = await authenticatedUser(supabase);
  assertAssetType(assetType, sourceApp);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('The editor did not provide a valid library payload.');
  if (assetId) {
    const { data, error } = await writeRequest(() => supabase.rpc('create_library_asset_version', {
      target_asset_id: assetId, next_payload: payload, next_artifacts: artifacts,
      next_metadata: metadata, next_content_hash: contentHash,
    }), 'Save library version');
    if (error && isMissingRpc(error)) return createVersionDirectly(supabase, user.id, assetId, payload, artifacts, metadata, contentHash);
    if (error) throw libraryError(error, 'A new library version could not be saved.');
    return { assetId, versionId: data?.id, versionNumber: data?.version_number, updated: true };
  }
  const { data, error } = await writeRequest(() => supabase.rpc('create_library_asset_with_version', {
    new_asset_type: assetType, new_source_app: sourceApp, new_name: cleanName(name),
    new_description: String(description || '').trim().slice(0, 2000), new_visibility: visibility,
    new_payload: payload, new_artifacts: artifacts,
    new_metadata: { contract: CONTRACT_ID, contractVersion: CONTRACT_VERSION, ...metadata },
    new_content_hash: contentHash,
  }), 'Save library item');
  if (error && isMissingRpc(error)) return createAssetDirectly(supabase, user.id, {
    assetType, sourceApp, name, description, visibility, payload, artifacts,
    metadata: { contract: CONTRACT_ID, contractVersion: CONTRACT_VERSION, ...metadata }, contentHash,
  });
  if (error) throw libraryError(error, 'The item could not be saved to your shared library.');
  const result = Array.isArray(data) ? data[0] : data;
  return { assetId: result?.asset_id, versionId: result?.version_id, versionNumber: result?.version_number, updated: false };
}
async function createVersionDirectly(supabase, userId, assetId, payload, artifacts, metadata, contentHash) {
  const current = await writeRequest(() => supabase.from('library_asset_versions').select('version_number').eq('asset_id', assetId).order('version_number', { ascending: false }).limit(1), 'Check library version');
  if (current.error) throw libraryError(current.error, 'Library versions could not be checked.');
  const versionNumber = Number(current.data?.[0]?.version_number || 0) + 1;
  const inserted = await writeRequest(() => supabase.from('library_asset_versions').insert({
    asset_id: assetId, version_number: versionNumber, payload, artifacts, metadata,
    content_hash: contentHash || null, created_by: userId,
  }).select('id,version_number').single(), 'Save library version');
  if (inserted.error) throw libraryError(inserted.error, 'A new library version could not be saved.');
  const updated = await writeRequest(() => supabase.from('library_assets').update({ current_version_id: inserted.data.id }).eq('id', assetId), 'Activate library version');
  if (updated.error) throw libraryError(updated.error, 'The library asset could not be updated.');
  return { assetId, versionId: inserted.data.id, versionNumber: inserted.data.version_number, updated: true };
}
async function createAssetDirectly(supabase, ownerId, options) {
  const asset = await writeRequest(() => supabase.from('library_assets').insert({
    owner_id: ownerId, asset_type: options.assetType, source_app: options.sourceApp,
    name: cleanName(options.name), description: String(options.description || '').trim().slice(0, 2000),
    visibility: options.visibility,
  }).select('id').single(), 'Create library item');
  if (asset.error) throw libraryError(asset.error, 'The item could not be saved to your shared library.');
  const version = await createVersionDirectly(supabase, ownerId, asset.data.id, options.payload, options.artifacts, options.metadata, options.contentHash);
  return { ...version, updated: false };
}

export async function uploadLibraryThumbnail(supabase, { assetId, versionId, dataUrl, previousPath = null }) {
  if (!assetId || !versionId || !dataUrl) return null;
  const user = await authenticatedUser(supabase);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${user.id}/${assetId}/${versionId}/thumbnail.webp`;
  if (previousPath === path) return path;
  const uploaded = await writeRequest(() => supabase.storage.from(LIBRARY_BUCKET).upload(path, blob, {
    contentType: 'image/webp', cacheControl: '31536000', upsert: false,
  }), 'Upload project thumbnail');
  if (uploaded.error) throw libraryError(uploaded.error, 'The project thumbnail could not be uploaded.');
  const updated = await writeRequest(() => supabase.from('library_assets').update({ thumbnail_path: path }).eq('id', assetId), 'Attach project thumbnail');
  if (updated.error) {
    await supabase.storage.from(LIBRARY_BUCKET).remove([path]).catch(() => {});
    throw libraryError(updated.error, 'The project thumbnail could not be attached.');
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(LIBRARY_BUCKET).remove([previousPath]).catch(() => {});
  return path;
}
export async function setLibraryAssetVersionRetention(supabase, assetId, keepCount) {
  await authenticatedUser(supabase);
  const count = Math.max(1, Math.min(100, Math.round(Number(keepCount) || 20)));
  const { data, error } = await writeRequest(() => supabase.rpc('set_library_asset_version_retention', {
    target_asset_id: assetId, keep_count: count,
  }), 'Update version retention');
  if (error) throw libraryError(error, 'Version retention could not be updated. Run the latest Supabase migration first.');
  return { keepCount: count, deletedCount: Number(data) || 0 };
}
export async function archiveLibraryAsset(supabase, assetId) {
  await authenticatedUser(supabase);
  const { error } = await writeRequest(() => supabase.from('library_assets').update({ lifecycle_status: 'archived' }).eq('id', assetId), 'Archive library item');
  if (error) throw libraryError(error, 'The library item could not be archived.');
}
export async function updateLibraryAssetMetadata(supabase, assetId, { name, description = '' } = {}) {
  await authenticatedUser(supabase);
  const { error } = await writeRequest(() => supabase.from('library_assets').update({
    name: cleanName(name), description: String(description || '').trim().slice(0, 2000),
  }).eq('id', assetId), 'Update library item');
  if (error) throw libraryError(error, 'The library item could not be renamed.');
}
export async function setCurrentLibraryAssetVersion(supabase, assetId, versionId) {
  await authenticatedUser(supabase);
  const { error } = await writeRequest(() => supabase.from('library_assets').update({ current_version_id: versionId }).eq('id', assetId), 'Activate library version');
  if (error) throw libraryError(error, 'The current library version could not be changed.');
}
export const LIBRARY_CONTRACT = Object.freeze({ id: CONTRACT_ID, version: CONTRACT_VERSION, appByType: APP_BY_TYPE });
