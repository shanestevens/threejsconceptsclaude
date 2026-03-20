import RAPIER from '@dimforge/rapier3d-compat'

let _promise: Promise<void> | null = null

/** Call once; subsequent calls return the same promise. */
export function initRapier(): Promise<void> {
  if (!_promise) _promise = RAPIER.init()
  return _promise
}

export { RAPIER }
