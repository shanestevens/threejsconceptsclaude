import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

type RapierWorld = InstanceType<typeof RAPIER.World>
type RigidBody   = ReturnType<RapierWorld['createRigidBody']>

interface PhysicsBody {
  body: RigidBody
  mesh: THREE.Mesh
}

const DOMINO_COUNT  = 40
const DOMINO_HX     = 0.08   // half-width  (thin)
const DOMINO_HY     = 0.35   // half-height (tall)
const DOMINO_HZ     = 0.22   // half-depth  (wide face)
const IMPULSE_DELAY = 1.5    // seconds before tipping domino 0
const RESET_EVERY   = 12     // seconds before rebuilding

// Two alternating accent colours
const COLOR_A = new THREE.Color(0x6366f1)  // indigo
const COLOR_B = new THREE.Color(0xf97316)  // orange

export class DominoesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private world: RapierWorld | null = null
  private dominoes: PhysicsBody[] = []
  private firstAngle = 0     // yaw of domino 0 — needed for tipping axis

  private ready      = false
  private started    = false
  private elapsed    = 0
  private resetTimer = 0

  private _canvas!: HTMLCanvasElement
  private _onClick!: () => void

  // ─── init ────────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    this._canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap

    this.scene  = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    this.camera.position.set(0, 8, 16)
    this.camera.lookAt(0, 0, 0)

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const sun = new THREE.DirectionalLight(0xfff0d0, 3.0)
    sun.position.set(6, 10, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near   = 0.5
    sun.shadow.camera.far    = 50
    sun.shadow.camera.left   = sun.shadow.camera.bottom = -20
    sun.shadow.camera.right  = sun.shadow.camera.top    =  20
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x88aaff, 0.8)
    fill.position.set(-6, -3, -6)
    this.scene.add(fill)

    // Click to restart
    this._onClick = () => {
      if (!this.ready) return
      this.clearDominoes()
      this.spawnDominoes()
      this.elapsed = 0
      this.resetTimer = 0
      this.started = false
    }
    canvas.addEventListener('click', this._onClick)
    canvas.style.cursor = 'pointer'

    initRapier().then(() => this.initPhysics())
  }

  // ─── Trigger first domino ────────────────────────────────────────────────────

  private triggerFirst(): void {
    const first = this.dominoes[0]
    if (!first) return

    // Compute forward direction (toward domino 1)
    const c0 = this.curvePos(0)
    const c1 = this.curvePos(1)
    const fdx = c1.x - c0.x
    const fdz = c1.z - c0.z
    const flen = Math.sqrt(fdx * fdx + fdz * fdz)
    const nx = fdx / flen
    const nz = fdz / flen

    // setLinvel with upward Y lifts the domino off the floor for a few frames,
    // removing the contact constraint that otherwise cancels angular velocity.
    first.body.setLinvel({ x: nx * 0.5, y: 1.2, z: nz * 0.5 }, true)

    // Local X axis = (cos(a), 0, -sin(a)) for THREE.js Y-rotation by angle a.
    // Spinning around this axis tips the domino forward toward the chain.
    const a = this.firstAngle
    first.body.setAngvel({ x: Math.cos(a) * 3.0, y: 0, z: -Math.sin(a) * 3.0 }, true)
  }

  // ─── Physics init ─────────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.world   = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.elapsed = 0
    this.resetTimer = 0
    this.started = false

    // ── Floor ──────────────────────────────────────────────────────────────────
    const floorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.3, 0)
    const floorBody     = this.world.createRigidBody(floorBodyDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.3, 20), floorBody)

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.85 }),
    )
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    this.scene.add(floorMesh)

    // ── Dominoes along S-curve ─────────────────────────────────────────────────
    this.spawnDominoes()
    this.ready = true
  }

  // ─── S-curve helpers ──────────────────────────────────────────────────────────

  /** World-space position of domino i along the S-curve (y=0, standing on floor). */
  private curvePos(i: number): { x: number; z: number } {
    const t = i / (DOMINO_COUNT - 1)
    return {
      x: Math.sin(t * Math.PI * 2) * 4,
      z: (t - 0.5) * 14,
    }
  }

  private spawnDominoes(): void {
    const geo = new THREE.BoxGeometry(DOMINO_HX * 2, DOMINO_HY * 2, DOMINO_HZ * 2)

    for (let i = 0; i < DOMINO_COUNT; i++) {
      const { x, z } = this.curvePos(i)

      // Tangent angle: one-sided difference at endpoints to avoid zero-vector bug
      const next = i < DOMINO_COUNT - 1 ? this.curvePos(i + 1) : this.curvePos(i)
      const prev = i > 0                ? this.curvePos(i - 1) : this.curvePos(i)
      const dx = next.x - prev.x
      const dz = next.z - prev.z
      const angle = Math.atan2(dx, dz)   // yaw so domino faces along curve

      // Domino stands on the floor: centre y = DOMINO_HY (above y=0 ground)
      const yPos = DOMINO_HY

      const color = i % 2 === 0 ? COLOR_A.clone() : COLOR_B.clone()
      // slight hue variety
      color.offsetHSL((i / DOMINO_COUNT) * 0.12 - 0.06, 0, 0)

      const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow    = true
      mesh.receiveShadow = true
      mesh.position.set(x, yPos, z)
      mesh.rotation.y    = angle
      this.scene.add(mesh)

      if (i === 0) this.firstAngle = angle

      // Physics: dynamic body, start upright — rotation on the body, not the collider
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0))
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, yPos, z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      const body = this.world!.createRigidBody(bodyDesc)

      // Collider in body-local space (body is already oriented)
      const colDesc = RAPIER.ColliderDesc.cuboid(DOMINO_HX, DOMINO_HY, DOMINO_HZ)
      this.world!.createCollider(colDesc, body)

      this.dominoes.push({ body, mesh })
    }
  }

  private clearDominoes(): void {
    for (const { body, mesh } of this.dominoes) {
      this.world!.removeRigidBody(body)
      ;(mesh.material as THREE.Material).dispose()
      this.scene.remove(mesh)
    }
    this.dominoes = []
  }

  // ─── SceneModule interface ────────────────────────────────────────────────────

  update(time: number): void {
    void time  // not used for dt; we track elapsed ourselves at ~60fps

    if (!this.ready || !this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    const dt = 1 / 60
    this.elapsed    += dt
    this.resetTimer += dt

    // Tip the first domino after a short delay
    if (!this.started && this.elapsed >= IMPULSE_DELAY) {
      this.started = true
      this.triggerFirst()
    }

    // Periodic reset
    if (this.resetTimer >= RESET_EVERY) {
      this.resetTimer = 0
      this.elapsed    = 0
      this.started    = false
      this.clearDominoes()
      this.spawnDominoes()
    }

    this.world.step()

    for (const { body, mesh } of this.dominoes) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this._canvas?.removeEventListener('click', this._onClick)
    this._canvas && (this._canvas.style.cursor = '')
    this.renderer.dispose()
    if (this.world) {
      this.world.free()
      this.world = null
    }
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
