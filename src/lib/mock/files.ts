// Stand-in for Supabase Storage: file bodies live in IndexedDB (localStorage is too small for PDFs).
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('luxerefy-crm-files', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) => {
  const store = (await open()).transaction('files', mode).objectStore('files')
  return new Promise<T>((resolve, reject) => {
    const r = fn(store)
    r.onsuccess = () => resolve(r.result as T)
    r.onerror = () => reject(r.error)
  })
}

export const putFile = (key: string, file: Blob) => run<IDBValidKey>('readwrite', s => s.put(file, key))
export const listFiles = (prefix: string) =>
  run<IDBValidKey[]>('readonly', s => s.getAllKeys()).then(ks => ks.map(String).filter(k => k.startsWith(prefix)))
export const getFile = (key: string) => run<Blob | undefined>('readonly', s => s.get(key))
export const deleteFile = (key: string) => run<undefined>('readwrite', s => s.delete(key))
