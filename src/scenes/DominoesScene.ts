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
const IMPULSE_DELAY = 1.2    // seconds before tipping domino 0
const RESET_EVERY   = 14     // seconds before rebuilding
const TIP_RATE      = 3.2    // rad/s — how fast domino 0 tips (scripted)

const COLOR_A = new THREE.Color(0x6366f1)
const COLOR_B = new THREE.Color(0xf97316)

export class DominoesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private world: RapierWorld | null = null
  private dominoes: PhysicsBody[] = []

  private firstAngle = 0   // yaw of domino 0
  private firstX     = 0
  private firstZ     = 0

  private ready      = false
  private started    = false
  private tipping    = false
  private tipAngle   = 0    // current scripted tip angle (0 → π/2)
  private elapsed    = 0
  private resetTimer = 0

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

    this.scene  = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    this.camera.position.set(0, 8, 16)
    this.camera.lookAt(0, 0, 0)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const sun = new THREE.DirectionalLight(0xfff0d0, 3.0)
    sun.position.set(6, 10, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 50
    sun.shadow.camera.left = sun.shadow.camera.bottom = -20
    sun.shadow.camera.right = sun.shadow.camera.top   =  20
    this.scene.add(sun)
    this.scene.add(new THREE.DirectionalLight(0x88aaff, 0.8).position.set(-6, -3, -6) && sun)

    // Click restarts the chain
    this._onClick = () => { if (this.ready) this.reset() }
    canvas.addEventListener('click', this._onClick)
    canvas.style.cursor = 'pointer'

    initRapier().then(() => this.initPhysics())
  }

  // ─── Physics init ───────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.reset()
  }

  private reset(): void {
    this.clearDominoes()
    this.spawnDominoes()
    this.elapsed    = 0
    this.resetTimer = 0
    this.started    = false
    this.tipping    = false
    this.tipAngle   = 0
    this.ready      = true
  }

  // ─── Curve helpers ─────────────────────────────────────────────────────────

  private curvePos(i: number): { x: number; z: number } {
    const t = i / (DOMINO_COUNT - 1)
    return {
      x: Math.sin(t * Math.PI * 2) * 4,
      z: (t - 0.5) * 14,
    }
  }

  private spawnDominoes(): void {
    if (!this.world) return
    const geo = new THREE.BoxGeometry(DOMINO_HX * 2, DOMINO_HY * 2, DOMINO_HZ * 2)

    for (let i = 0; i < DOMINO_COUNT; i++) {
      const { x, z } = this.curvePos(i)

      // One-sided tangent at endpoints
      const next = i < DOMINO_COUNT - 1 ? this.curvePos(i + 1) : this.curvePos(i)
      const prev = i > 0                ? this.curvePos(i - 1) : this.curvePos(i)
      const angle = Math.atan2(next.x - prev.x, next.z - prev.z)

      const color = (i % 2 === 0 ? COLOR_A : COLOR_B).clone()
      color.offsetHSL((i / DOMINO_COUNT) * 0.12 - 0.06, 0, 0)

      const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.position.set(x, DOMINO_HY, z)
      mesh.rotation.y = angle
      this.scene.add(mesh)

      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0))

      let bodyDesc: ReturnType<typeof RAPIER.RigidBodyDesc.dynamic>
      if (i === 0) {
        // Domino 0 is KINEMATIC so we can script its tip arc
        // (WreckingBall uses the same pattern — confirmed working)
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(x, DOMINO_HY, z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }) as typeof bodyDesc
        this.firstAngle = angle
        this.firstX = x
        this.firstZ = z
      } else {
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, DOMINO_HY, z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      }

      const body = this.world.createRigidBody(bodyDesc)
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(DOMINO_HX, DOMINO_HY, DOMINO_HZ), body)
      this.dominoes.push({ body, mesh })
    }

    // Visual floor
    if (this.dominoes.length === DOMINO_COUNT) {
      const floorMesh = this.scene.getObjectByName('floor') as THREE.Mesh | undefined
      if (!floorMesh) {
        const fm = new THREE.Mesh(
          new THREE.PlaneGeometry(40, 40),
          new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.85 }),
        )
        fm.name = 'floor'
        fm.rotation.x = -Math.PI / 2
        fm.receiveShadow = true
        this.scene.add(fm)

        const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.3, 0))
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.3, 20), floorBody)
      }
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

  // ─── Kinematic tip arc ─────────────────────────────────────────────────────
  // Sweeps domino 0 through the physical tip motion each frame.
  // The kinematic body pushes domino 1 as it enters its space — proven technique
  // from WreckingBallScene.

  private stepKinematic(dt: number): void {
    if (!this.tipping) return

    this.tipAngle = Math.min(this.tipAngle + TIP_RATE * dt, Math.PI / 2)
    const φ  = this.tipAngle
    const a  = this.firstAngle

    // CoM position as domino sweeps around its front-bottom pivot:
    //   swing = displacement of CoM along the forward axis
    //   new_y = height of CoM
    const swing = DOMINO_HZ * (1 - Math.cos(φ)) + DOMINO_HY * Math.sin(φ)
    const newX  = this.firstX + swing * Math.sin(a)
    const newY  = DOMINO_HY  * Math.cos(φ) + DOMINO_HZ * Math.sin(φ)
    const newZ  = this.firstZ + swing * Math.cos(a)

    // Rotation = yaw then local-X tilt
    const yawQ  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0))
    const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), φ)
    const newQ  = yawQ.multiply(tiltQ)

    const d0 = this.dominoes[0]
    d0.body.setNextKinematicTranslation({ x: newX, y: newY, z: newZ })
    d0.body.setNextKinematicRotation({ x: newQ.x, y: newQ.y, z: newQ.z, w: newQ.w })
  }

  // ─── SceneModule interface ─────────────────────────────────────────────────

  update(time: number): void {
    void time

    if (!this.ready || !this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    const dt = 1 / 60
    this.elapsed    += dt
    this.resetTimer += dt

    // Start tipping after a pause so the user can see the layout
    if (!this.started && this.elapsed >= IMPULSE_DELAY) {
      this.started = true
      this.tipping = true
    }

    this.stepKinematic(dt)

    // Auto-reset
    if (this.resetTimer >= RESET_EVERY) this.reset()

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
