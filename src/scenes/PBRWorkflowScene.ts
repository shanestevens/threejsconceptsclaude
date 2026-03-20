import * as THREE from 'three'
import type { SceneModule } from '../types'

function makeRoughnessMap(roughnessValue: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  // Checkerboard — dark=smooth, light=rough
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const v = (row + col) % 2 === 0 ? roughnessValue * 255 : 255 - roughnessValue * 255
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(col * 32, row * 32, 32, 32)
    }
  }
  return new THREE.CanvasTexture(c)
}

function makeAOMap(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 256, 256)
  // Darken towards edges (simulates AO)
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 130)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.7)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

function makeNormalMap(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  // Tileable brickwork normal approximation
  const size = 256, brick = 64, mortar = 4
  ctx.fillStyle = `rgb(128,128,255)` // flat normal
  ctx.fillRect(0, 0, size, size)
  for (let row = 0; row < size / brick; row++) {
    for (let col = 0; col < size / brick + 1; col++) {
      const offset = (row % 2) * (brick / 2)
      const x = (col * brick - offset + size) % size
      const y = row * brick
      // Mortar groove — points left/right
      ctx.fillStyle = `rgb(90,128,200)`
      ctx.fillRect(x, y, mortar, brick)
      ctx.fillStyle = `rgb(128,90,200)`
      ctx.fillRect(0, y, size, mortar)
    }
  }
  return new THREE.CanvasTexture(c)
}

function makeAlbedo(hue: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = `hsl(${hue}, 75%, 50%)`
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

export class PBRWorkflowScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private spheres: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 7)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xfff4e0, 4.0)
    dir.position.set(5, 5, 5)
    this.scene.add(dir)
    const rim = new THREE.DirectionalLight(0x4488ff, 1.5)
    rim.position.set(-5, -2, -5)
    this.scene.add(rim)

    const configs: { label: string; mat: THREE.MeshStandardMaterial; x: number }[] = [
      {
        label: 'Albedo only',
        mat: new THREE.MeshStandardMaterial({ map: makeAlbedo(260), roughness: 0.5 }),
        x: -3.0,
      },
      {
        label: '+ NormalMap',
        mat: new THREE.MeshStandardMaterial({ map: makeAlbedo(260), normalMap: makeNormalMap(), normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.5 }),
        x: -1.0,
      },
      {
        label: '+ RoughnessMap',
        mat: new THREE.MeshStandardMaterial({ map: makeAlbedo(260), normalMap: makeNormalMap(), normalScale: new THREE.Vector2(1.5, 1.5), roughnessMap: makeRoughnessMap(0.3) }),
        x: 1.0,
      },
      {
        label: '+ aoMap',
        mat: (() => {
          const m = new THREE.MeshStandardMaterial({ map: makeAlbedo(260), normalMap: makeNormalMap(), normalScale: new THREE.Vector2(1.5, 1.5), roughnessMap: makeRoughnessMap(0.3), aoMap: makeAOMap(), aoMapIntensity: 1.5 })
          return m
        })(),
        x: 3.0,
      },
    ]

    configs.forEach(({ mat, x }) => {
      const geo = new THREE.SphereGeometry(0.75, 64, 64)
      // aoMap needs uv2
      geo.setAttribute('uv2', geo.attributes.uv.clone())
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = x
      this.scene.add(mesh)
      this.spheres.push(mesh)
    })
  }

  update(time: number): void {
    this.spheres.forEach((s) => { s.rotation.y = time * 0.25 })
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
