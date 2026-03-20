import * as THREE from 'three'
import type { SceneModule } from '../types'

function makeStarTexture(hue: number, saturation: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0,    `hsla(${hue}, ${saturation}%, 100%, 1)`)
  g.addColorStop(0.15, `hsla(${hue}, ${saturation}%, 95%, 0.9)`)
  g.addColorStop(0.4,  `hsla(${hue}, ${saturation}%, 85%, 0.4)`)
  g.addColorStop(1,    `hsla(${hue}, ${saturation}%, 70%, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function makeNebulaTexture(hue: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0,    `hsla(${hue}, 70%, 65%, 0.6)`)
  g.addColorStop(0.35, `hsla(${hue}, 60%, 55%, 0.35)`)
  g.addColorStop(0.7,  `hsla(${hue}, 50%, 45%, 0.12)`)
  g.addColorStop(1,    `hsla(${hue}, 40%, 35%, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export class SpriteScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private galaxy!: THREE.Group

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200)
    this.camera.position.set(0, 8, 22)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)

    this.galaxy = new THREE.Group()
    this.scene.add(this.galaxy)

    // --- Star textures: white, slightly blue, slightly warm ---
    const starConfigs: { hue: number; sat: number; weight: number }[] = [
      { hue: 0,   sat: 0,  weight: 0.45 }, // pure white
      { hue: 210, sat: 60, weight: 0.30 }, // cool blue-white
      { hue: 40,  sat: 50, weight: 0.25 }, // warm yellow-white
    ]

    const textures = starConfigs.map((cfg) => ({
      tex: makeStarTexture(cfg.hue, cfg.sat),
      weight: cfg.weight,
    }))

    // Build cumulative weight array for weighted random selection
    const cumulative: number[] = []
    let sum = 0
    for (const t of textures) {
      sum += t.weight
      cumulative.push(sum)
    }

    const pickTex = (): THREE.CanvasTexture => {
      const r = Math.random()
      for (let i = 0; i < cumulative.length; i++) {
        if (r < cumulative[i]) return textures[i].tex
      }
      return textures[textures.length - 1].tex
    }

    // Size tier helper: 70% tiny, 25% medium, 5% large
    const pickSize = (): number => {
      const r = Math.random()
      if (r < 0.70) return 0.08
      if (r < 0.95) return 0.15
      return 0.25
    }

    // 3500 star sprites in a flattened disk
    for (let i = 0; i < 3500; i++) {
      const mat = new THREE.SpriteMaterial({
        map: pickTex(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(mat)

      const x = (Math.random() - 0.5) * 28
      const y = (Math.random() - 0.5) * 1.5
      const z = (Math.random() - 0.5) * 28
      sprite.position.set(x, y, z)

      const s = pickSize()
      sprite.scale.setScalar(s)

      this.galaxy.add(sprite)
    }

    // --- 8 nebula sprites ---
    const nebulaHues = [280, 180, 320, 160, 300, 195, 340, 260]
    const nebulaData = [
      { pos: new THREE.Vector3( 6,  0.5, -4),  size: 2.2 },
      { pos: new THREE.Vector3(-8, -0.3,  2),  size: 1.8 },
      { pos: new THREE.Vector3( 3,  0.8,  8),  size: 2.5 },
      { pos: new THREE.Vector3(-5,  0.2, -7),  size: 1.5 },
      { pos: new THREE.Vector3( 9, -0.5,  5),  size: 1.0 },
      { pos: new THREE.Vector3(-3,  0.6, -2),  size: 2.0 },
      { pos: new THREE.Vector3( 1, -0.4, -9),  size: 1.7 },
      { pos: new THREE.Vector3(-7,  0.3,  7),  size: 1.3 },
    ]

    nebulaData.forEach((nd, i) => {
      const opacity = 0.12 + Math.random() * 0.13 // 0.12–0.25
      const mat = new THREE.SpriteMaterial({
        map: makeNebulaTexture(nebulaHues[i]),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.position.copy(nd.pos)
      sprite.scale.setScalar(nd.size)
      this.galaxy.add(sprite)
    })
  }

  update(time: number): void {
    this.galaxy.rotation.y = time * 0.04
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
