import * as THREE from 'three'
import type { SceneModule } from '../types'

interface Particle {
  sprite: THREE.Sprite
  vel: THREE.Vector3
  life: number
  maxLife: number
}

function makeSpriteTex(hue: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0,   `hsla(${hue}, 100%, 85%, 1)`)
  g.addColorStop(0.4, `hsla(${hue}, 95%, 60%, 0.8)`)
  g.addColorStop(1,   `hsla(${hue}, 90%, 40%, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export class SpriteScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private particles: Particle[] = []
  private mats: THREE.SpriteMaterial[] = []
  private spawnTimer = 0

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.z = 6

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Pre-build sprite materials for 8 hues
    const hues = [0, 30, 60, 120, 180, 210, 270, 330]
    hues.forEach((h) => {
      this.mats.push(
        new THREE.SpriteMaterial({ map: makeSpriteTex(h), transparent: true, depthWrite: false })
      )
    })
  }

  private spawn(): void {
    const mat = this.mats[Math.floor(Math.random() * this.mats.length)].clone()
    const sprite = new THREE.Sprite(mat)
    sprite.position.set(0, 0, 0)
    const scale = 0.15 + Math.random() * 0.45
    sprite.scale.setScalar(scale)

    const angle = Math.random() * Math.PI * 2
    const elevation = (Math.random() - 0.5) * Math.PI
    const speed = 1.5 + Math.random() * 2.5
    const vel = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * speed,
      Math.sin(elevation) * speed,
      Math.sin(angle) * Math.cos(elevation) * speed * 0.3
    )

    this.scene.add(sprite)
    const maxLife = 1.2 + Math.random() * 0.8
    this.particles.push({ sprite, vel, life: 0, maxLife })
  }

  update(time: number): void {
    const dt = 0.016

    // Continuous spawn
    this.spawnTimer += dt
    while (this.spawnTimer > 0.04) {
      this.spawn()
      this.spawnTimer -= 0.04
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt
      const t = p.life / p.maxLife

      p.sprite.position.addScaledVector(p.vel, dt)
      p.vel.y -= 2.0 * dt // gravity

      const mat = p.sprite.material as THREE.SpriteMaterial
      mat.opacity = 1 - t * t

      if (p.life >= p.maxLife) {
        this.scene.remove(p.sprite)
        this.particles.splice(i, 1)
      }
    }

    // Slowly rotate the whole scene
    this.scene.rotation.y = time * 0.1

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
