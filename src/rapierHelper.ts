import RAPIER from '@dimforge/rapier3d-compat'

let _promise: Promise<void> | null = null

/** Call once; subsequent calls return the same promise. */
export function initRapier(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!_promise) _promise = (RAPIER.init as any)({}) as Promise<void>
  return _promise!
}

export { RAPIER }
