const DB_NAME = 'neo-calendar-offline'
const STORE_NAME = 'snapshot'
const QUEUE_STORE = 'pending'

export type OfflineAction = {
  /** IndexedDB key and/or entity id (event/calendar), depending on action type. */
  id?: number | string
  type: string
  createdAt?: number
  payload?: unknown
  [key: string]: unknown
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export async function saveOfflineSnapshot(snapshot: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(snapshot, 'latest')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('snapshot save failed'))
  })
  db.close()
}

export async function loadOfflineSnapshot<T = unknown>(): Promise<T | null> {
  const db = await openDb()
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get('latest')
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error ?? new Error('snapshot load failed'))
  })
  db.close()
  return result
}

export async function enqueueOfflineAction(action: Record<string, unknown>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).add({ ...action, createdAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('queue enqueue failed'))
  })
  db.close()
}

export async function drainOfflineQueue(): Promise<OfflineAction[]> {
  const db = await openDb()
  const items = await new Promise<OfflineAction[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const req = tx.objectStore(QUEUE_STORE).getAll()
    req.onsuccess = () => resolve((req.result as OfflineAction[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error('queue drain failed'))
  })
  db.close()
  return items
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('queue clear failed'))
  })
  db.close()
}

export function isOfflineRequestError(err: unknown, browserHost: boolean): boolean {
  if (browserHost && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /Failed to fetch|NetworkError|network|offline|API 서버|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(
    message
  )
}
