// Eye-safety mode: a warm wash over the whole app, persisted per browser.
// A tiny external store rather than context, so the top-bar toggle and the settings
// page read the same value without a provider wrapping either of them.
import { useSyncExternalStore } from 'react'

const KEY = 'luxerefy-eye-safe'
const listeners = new Set<() => void>()

let on = (() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })()

function apply() {
  const el = document.documentElement
  if (on) el.dataset.eye = 'warm'
  else delete el.dataset.eye
}
apply()

export function toggleEyeSafe() {
  on = !on
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* preference just won't persist */ }
  apply()
  for (const l of listeners) l()
}

export const useEyeSafe = () =>
  useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    () => on,
    () => false,
  )
