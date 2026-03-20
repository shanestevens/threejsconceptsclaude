import type * as THREE from 'three'

export type Level = 'basic' | 'intermediate' | 'advanced' | 'physics' | 'experimental'

export interface Section {
  id: string
  title: string
  subtitle: string
  description: string
  tags: string[]
  code: string
}

export interface SceneModule {
  init(canvas: HTMLCanvasElement): void
  update(time: number): void
  resize(width: number, height: number): void
  destroy(): void
  readonly orbitCamera?: THREE.Camera
}
