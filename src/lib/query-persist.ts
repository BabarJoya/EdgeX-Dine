import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Query } from '@tanstack/react-query'
import { createStore, del, get, set } from 'idb-keyval'

/**
 * Keeps the data a station needs to start without internet (who you are,
 * your restaurant and branches, permissions, the menu, your open shift) in
 * IndexedDB on this device. Everything else is always fetched live.
 */
const store = createStore('edgex-cache', 'queries')

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k, store).then((v) => v ?? null),
    setItem: (k, v) => set(k, v, store),
    removeItem: (k) => del(k, store),
  },
  key: 'edgex-query-cache',
  throttleTime: 2000,
})

const OFFLINE_KEYS = new Set([
  'memberships',
  'permissions',
  'branches',
  'subscription',
  'tenant-access',
  'is-platform-admin',
  'menu',
  'shift',
])

export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Bump when cached shapes change, so old caches are dropped.
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) =>
      q.state.status === 'success' && OFFLINE_KEYS.has(String(q.queryKey[0])),
  },
}

/** Forget this device's cached data (on sign-out). */
export const clearPersistedCache = () => persister.removeClient()
