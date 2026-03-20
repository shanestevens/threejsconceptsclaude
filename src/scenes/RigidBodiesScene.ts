import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

type RapierWorld = InstanceType<typeof RAPIER.World>
type RigidBody   = ReturnType<RapierWorld['createRigidBody']>

interface PhysicsBody {
  body: RigidBody
  mesh: THREE.Mesh
}

const BODY_COUNT  = 80
const RESET_EVERY = 8   // seconds

export class RigidBodiesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private world: RapierWorld | null = null
  private bodies: PhysicsBody[] = []
  private ready = false
  private resetTimer = 0

  // ─── init ────────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type    = THREE.PCFShadowMap

    // Scene + camera
    this.scene  = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    this.camera.position.set(0, 6, 14)
    this.camera.lookAt(0, 2, 0)

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    const sun = new THREE.DirectionalLight(0xfffbe0, 3.5)
    sun.position.set(8, 12, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far  = 50
    sun.shadow.camera.left = sun.shadow.camera.bottom = -16
    sun.shadow.camera.right = sun.shadow.camera.top   =  16
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x4488ff, 1.0)
    fill.position.set(-8, -4, -8)
    this.scene.add(fill)

    // Kick off async physics setup
    initRapier().then(() => this.initPhysics())
  }

  // ─── Physics init ─────────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // ── Floor ──────────────────────────────────────────────────────────────────
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.4, 0)
    const floorBody = this.world.createRigidBody(floorDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(15, 0.4, 15), floorBody)

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 }),
    )
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    this.scene.add(floorMesh)

    // ── Invisible walls ────────────────────────────────────────────────────────
    const addWall = (x: number, y: number, z: number, hw: number, hh: number, hd: number) => {
      const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
      const body = this.world!.createRigidBody(desc)
      this.world!.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd), body)
    }
    addWall( 7,  4,  0, 0.3, 4, 15)
    addWall(-7,  4,  0, 0.3, 4, 15)
    addWall( 0,  4,  7, 15,  4, 0.3)
    addWall( 0,  4, -7, 15,  4, 0.3)

    // ── Dynamic bodies ─────────────────────────────────────────────────────────
    this.spawnBodies()
    this.ready = true
  }

  // ─── Spawn helpers ────────────────────────────────────────────────────────────

  private spawnBodies(): void {
    for (let i = 0; i < BODY_COUNT; i++) {
      const isSphere = Math.random() < 0.3
      const x = (Math.random() - 0.5) * 8   // ±4
      const z = (Math.random() - 0.5) * 8
      const y = 4 + Math.random() * 10       // 4–14

      const color = new THREE.Color()
      color.setHSL(Math.random(), 0.75, 0.55)

      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.3 })

      let mesh: THREE.Mesh
      let colliderDesc: ReturnType<typeof RAPIER.ColliderDesc.ball>

      if (isSphere) {
        const r = 0.35
        mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat)
        colliderDesc = RAPIER.ColliderDesc.ball(r)
      } else {
        const hx = 0.25 + Math.random() * 0.20  // 0.25–0.45
        const hy = 0.25 + Math.random() * 0.20
        const hz = 0.25 + Math.random() * 0.20
        mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat)
        colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      }

      mesh.castShadow    = true
      mesh.receiveShadow = true
      this.scene.add(mesh)

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      const body     = this.world!.createRigidBody(bodyDesc)
      this.world!.createCollider(colliderDesc, body)

      this.bodies.push({ body, mesh })
    }
  }

  private clearBodies(): void {
    for (const { body, mesh } of this.bodies) {
      this.world!.removeRigidBody(body)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      this.scene.remove(mesh)
    }
    this.bodies = []
  }

  // ─── SceneModule interface ────────────────────────────────────────────────────

  update(time: number): void {
    void time  // dt is approximated internally; elapsed used for reset only
    if (!this.ready || !this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    this.world.step()

    for (const { body, mesh } of this.bodies) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }

    // Periodic reset
    this.resetTimer += 1 / 60  // approximate; caller drives at ~60 fps
    if (this.resetTimer >= RESET_EVERY) {
      this.resetTimer = 0
      this.clearBodies()
      this.spawnBodies()
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.renderer.dispose()
    if (this.world) {
      this.world.free()
      this.world = null
    }
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
