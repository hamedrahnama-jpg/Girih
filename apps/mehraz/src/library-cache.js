const DATABASE_NAME = 'mehraz-library-cache';
const DATABASE_VERSION = 1;
const memoryCache = new Map();

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) database.createObjectStore('records');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const database = await openDatabase();
    if (!database) return null;
    const value = await new Promise((resolve, reject) => {
      const transaction = database.transaction('records', 'readonly');
      const request = transaction.objectStore('records').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (value) memoryCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

async function write(key, value) {
  const record = { ...value, cachedAt: Date.now() };
  memoryCache.set(key, record);
  try {
    const database = await openDatabase();
    if (!database) return record;
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put(record, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Memory caching still keeps the current session fast when IndexedDB is unavailable.
  }
  return record;
}

export const readLibraryCatalogueCache = (userId) => read(`catalogue:${userId}`);
export const writeLibraryCatalogueCache = (userId, value) => write(`catalogue:${userId}`, value);
export const readLibraryVersionCache = (versionId) => read(`version:${versionId}`);
export const writeLibraryVersionCache = (version) => write(`version:${version.id}`, { version });
export const readLibraryVersionListCache = (assetId) => read(`version-list:${assetId}`);
export const writeLibraryVersionListCache = (assetId, versions) => write(`version-list:${assetId}`, { versions });

