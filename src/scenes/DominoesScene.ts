import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

type RapierWorld = InstanceType<typeof RAPIER.World>
type RigidBody   = ReturnType<RapierWorld['createRigidBody']>

interface PhysicsBody {
  body: RigidBody
  mesh: THREE.Mesh
}

const DOMINO_COUNT  = 20
const DOMINO_HX     = 0.08   // half-width  (thin)
const DOMINO_HY     = 0.35   // half-height (tall)
const DOMINO_HZ     = 0.22   // half-depth  (wide face)
const SPACING       = 0.55   // center-to-center along Z
const IMPULSE_DELAY = 1.2    // seconds before domino 0 starts tipping
const RESET_EVERY   = 14     // seconds before auto-reset
const TIP_RATE      = 3.2    // rad/s

const COLOR_A = new THREE.Color(0x6366f1)
const COLOR_B = new THREE.Color(0xf97316)

export class DominoesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private world: RapierWorld | null = null
  private dominoes: PhysicsBody[] = []

  private tipping   = false
  private tipAngle  = 0
  private elapsed   = 0
  private domino0Z  = 0   // world-Z of domino 0 (chain is centered, not starting at 0)

  private _canvas!: HTMLCanvasElement
  private _onClick!: () => void

  // ─── init ──────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    this._canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = null

    // Chain is centered on z=0; camera looks straight at the midpoint from the side
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    this.camera.position.set(7, 3, 0)
    this.camera.lookAt(0, 1, 0)

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

    this._onClick = () => this.reset()
    canvas.addEventListener('click', this._onClick)
    canvas.style.cursor = 'pointer'

    initRapier().then(() => this.initPhysics())
  }

  // ─── Physics init ───────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Static floor (persists across resets)
    const fb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.3, 0))
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.3, 20), fb)

    const fm = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.85 }),
    )
    fm.rotation.x  = -Math.PI / 2
    fm.receiveShadow = true
    this.scene.add(fm)

    this.spawnDominoes()
  }

  private spawnDominoes(): void {
    if (!this.world) return
    const geo = new THREE.BoxGeometry(DOMINO_HX * 2, DOMINO_HY * 2, DOMINO_HZ * 2)

    // Rotate 90° around Y so the thin face (HX) faces along the chain (Z),
    // and the wide face (HZ) faces the camera (X). Correct real-domino orientation.
    const yaw90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))

    const midZ = (DOMINO_COUNT - 1) * SPACING / 2
    this.domino0Z = -midZ   // domino 0 sits at z = -midZ
    for (let i = 0; i < DOMINO_COUNT; i++) {
      const z     = i * SPACING - midZ
      const color = (i % 2 === 0 ? COLOR_A : COLOR_B).clone()
      color.offsetHSL((i / DOMINO_COUNT) * 0.1, 0, 0)

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 }))
      mesh.castShadow = mesh.receiveShadow = true
      mesh.position.set(0, DOMINO_HY, z)
      mesh.quaternion.copy(yaw90)
      this.scene.add(mesh)

      const bodyDesc = i === 0
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(0, DOMINO_HY, z)
            .setRotation({ x: yaw90.x, y: yaw90.y, z: yaw90.z, w: yaw90.w })
        : RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, DOMINO_HY, z)
            .setRotation({ x: yaw90.x, y: yaw90.y, z: yaw90.z, w: yaw90.w })

      const body = this.world.createRigidBody(bodyDesc)
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(DOMINO_HX, DOMINO_HY, DOMINO_HZ), body)
      this.dominoes.push({ body, mesh })
    }
  }

  private clearDominoes(): void {
    if (!this.world) return
    for (const { body, mesh } of this.dominoes) {
      this.world.removeRigidBody(body)
      ;(mesh.material as THREE.Material).dispose()
      this.scene.remove(mesh)
    }
    this.dominoes = []
  }

  private reset(): void {
    this.clearDominoes()
    this.spawnDominoes()   // sets this.domino0Z
    this.tipping  = false
    this.tipAngle = 0
    this.elapsed  = 0
  }

  // ─── Kinematic tip arc ─────────────────────────────────────────────────────
  // Sweeps domino 0 through a fall arc each frame, physically pushing domino 1.

  private stepKinematic(dt: number): void {
    if (!this.tipping) return
    this.tipAngle = Math.min(this.tipAngle + TIP_RATE * dt, Math.PI / 2)
    const φ = this.tipAngle

    // After yaw90, the thin face (HX=0.08) is along Z. Pivot = front-bottom edge at (0, 0, HX).
    const swing = DOMINO_HX * (1 - Math.cos(φ)) + DOMINO_HY * Math.sin(φ)
    const newZ = this.domino0Z + swing
    const newY = DOMINO_HY * Math.cos(φ) + DOMINO_HX * Math.sin(φ)

    // World-space tilt around +X (pre-multiply = apply on top of existing yaw in world frame)
    const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), φ)
    const yaw90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
    const newQ  = tiltQ.multiply(yaw90)   // tiltQ * yaw90 = world tilt applied after initial yaw

    const d0 = this.dominoes[0]
    d0.body.setNextKinematicTranslation({ x: 0, y: newY, z: newZ })
    d0.body.setNextKinematicRotation({ x: newQ.x, y: newQ.y, z: newQ.z, w: newQ.w })
  }

  // ─── SceneModule interface ─────────────────────────────────────────────────

  update(time: number): void {
    void time
    if (!this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    const dt = 1 / 60
    this.elapsed += dt

    if (!this.tipping && this.elapsed >= IMPULSE_DELAY) this.tipping = true
    if (this.elapsed >= RESET_EVERY) this.reset()

    this.stepKinematic(dt)
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
    if (this._canvas) this._canvas.style.cursor = ''
    this.renderer.dispose()
    this.world?.free()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
