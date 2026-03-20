import * as THREE from 'three'
import type { SceneModule } from '../types'

const ROWS = 22
const COLS = 22
const SPACING = 0.2

interface Particle {
  pos: THREE.Vector3
  prev: THREE.Vector3
  pinned: boolean
}

export class ClothScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private particles: Particle[] = []
  private constraints: [number, number, number][] = [] // [a, b, restLen]
  private posAttr!: THREE.BufferAttribute
  private mesh!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 1, 6)
    this.camera.lookAt(0, -0.5, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 3.0)
    dir.position.set(5, 5, 3)
    this.scene.add(dir)
    const rim = new THREE.DirectionalLight(0x4488ff, 1.5)
    rim.position.set(-5, -3, -3)
    this.scene.add(rim)

    const idx = (r: number, c: number) => r * COLS + c

    // Init particles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pos = new THREE.Vector3(
          (c - (COLS - 1) / 2) * SPACING,
          -r * SPACING + (ROWS * SPACING) / 2,
          0
        )
        this.particles.push({ pos, prev: pos.clone(), pinned: r === 0 })
      }
    }

    // Structural constraints
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) this.constraints.push([idx(r, c), idx(r, c + 1), SPACING])
        if (r < ROWS - 1) this.constraints.push([idx(r, c), idx(r + 1, c), SPACING])
        if (r < ROWS - 1 && c < COLS - 1) {
          const d = SPACING * Math.SQRT2
          this.constraints.push([idx(r, c), idx(r + 1, c + 1), d])
          this.constraints.push([idx(r, c + 1), idx(r + 1, c), d])
        }
      }
    }

    // Geometry
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(ROWS * COLS * 3)
    const uvs = new Float32Array(ROWS * COLS * 2)
    const indices: number[] = []

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(r, c)
        positions[i * 3]     = this.particles[i].pos.x
        positions[i * 3 + 1] = this.particles[i].pos.y
        positions[i * 3 + 2] = this.particles[i].pos.z
        uvs[i * 2]     = c / (COLS - 1)
        uvs[i * 2 + 1] = 1 - r / (ROWS - 1)
        if (r < ROWS - 1 && c < COLS - 1) {
          indices.push(i, i + 1, i + COLS, i + 1, i + COLS + 1, i + COLS)
        }
      }
    }

    this.posAttr = new THREE.BufferAttribute(positions, 3)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.posAttr)
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(indices)

    // Gradient canvas texture for the cloth
    const texCanvas = document.createElement('canvas')
    texCanvas.width = texCanvas.height = 256
    const ctx = texCanvas.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 256, 256)
    g.addColorStop(0,    '#6366f1')
    g.addColorStop(0.33, '#ec4899')
    g.addColorStop(0.66, '#f59e0b')
    g.addColorStop(1,    '#22c55e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, 256); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(256, i * 32); ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(texCanvas)

    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    })

    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)
  }

  private simulate(time: number): void {
    const dt   = 0.016
    const grav = new THREE.Vector3(0, -9.8 * dt * dt * 0.5, 0)
    const wind = new THREE.Vector3(
      Math.sin(time * 0.7) * 1.2 * dt * dt,
      0,
      Math.cos(time * 0.5) * 0.8 * dt * dt
    )

    for (const p of this.particles) {
      if (p.pinned) continue
      const vel = p.pos.clone().sub(p.prev)
      vel.multiplyScalar(0.99) // damping
      p.prev.copy(p.pos)
      p.pos.add(vel).add(grav).add(wind)
    }

    // Constraint satisfaction (Jakobsen, 6 iterations)
    for (let iter = 0; iter < 6; iter++) {
      for (const [ai, bi, rest] of this.constraints) {
        const pa = this.particles[ai]
        const pb = this.particles[bi]
        const delta = pb.pos.clone().sub(pa.pos)
        const dist  = delta.length()
        if (dist === 0) continue
        const correction = delta.multiplyScalar((1 - rest / dist) * 0.5)
        if (!pa.pinned) pa.pos.add(correction)
        if (!pb.pinned) pb.pos.sub(correction)
      }
    }
  }

  update(time: number): void {
    this.simulate(time)

    const arr = this.posAttr.array as Float32Array
    for (let i = 0; i < this.particles.length; i++) {
      arr[i * 3]     = this.particles[i].pos.x
      arr[i * 3 + 1] = this.particles[i].pos.y
      arr[i * 3 + 2] = this.particles[i].pos.z
    }
    this.posAttr.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()

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
