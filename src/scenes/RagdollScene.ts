import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

type RapierWorld = InstanceType<typeof RAPIER.World>
type RigidBody   = ReturnType<RapierWorld['createRigidBody']>

// ─── Ragdoll definition ───────────────────────────────────────────────────────

interface PartDef {
  name: string
  shape: 'ball' | 'cuboid'
  // ball: [r], cuboid: [hx, hy, hz]
  dims: number[]
  // Three.js geometry full dims: ball [r], box [w, h, d]
  geomDims: number[]
  color: number
  x: number
  y: number
  z: number
}

const PARTS: PartDef[] = [
  { name: 'torso',     shape: 'cuboid', dims: [0.22, 0.32, 0.14], geomDims: [0.44, 0.64, 0.28], color: 0x4f46e5, x:  0,     y: 5.5,  z: 0 },
  { name: 'head',      shape: 'ball',   dims: [0.22],              geomDims: [0.22],              color: 0xffd4a3, x:  0,     y: 6.2,  z: 0 },
  { name: 'upperArmL', shape: 'cuboid', dims: [0.1, 0.22, 0.1],   geomDims: [0.2, 0.44, 0.2],   color: 0xffd4a3, x: -0.42,  y: 5.5,  z: 0 },
  { name: 'lowerArmL', shape: 'cuboid', dims: [0.09, 0.2, 0.09],  geomDims: [0.18, 0.4, 0.18],  color: 0xffd4a3, x: -0.42,  y: 5.0,  z: 0 },
  { name: 'upperArmR', shape: 'cuboid', dims: [0.1, 0.22, 0.1],   geomDims: [0.2, 0.44, 0.2],   color: 0xffd4a3, x:  0.42,  y: 5.5,  z: 0 },
  { name: 'lowerArmR', shape: 'cuboid', dims: [0.09, 0.2, 0.09],  geomDims: [0.18, 0.4, 0.18],  color: 0xffd4a3, x:  0.42,  y: 5.0,  z: 0 },
  { name: 'upperLegL', shape: 'cuboid', dims: [0.12, 0.25, 0.12], geomDims: [0.24, 0.5, 0.24],  color: 0x1e293b, x: -0.16,  y: 4.85, z: 0 },
  { name: 'lowerLegL', shape: 'cuboid', dims: [0.1, 0.23, 0.1],   geomDims: [0.2, 0.46, 0.2],   color: 0x1e293b, x: -0.16,  y: 4.3,  z: 0 },
  { name: 'upperLegR', shape: 'cuboid', dims: [0.12, 0.25, 0.12], geomDims: [0.24, 0.5, 0.24],  color: 0x1e293b, x:  0.16,  y: 4.85, z: 0 },
  { name: 'lowerLegR', shape: 'cuboid', dims: [0.1, 0.23, 0.1],   geomDims: [0.2, 0.46, 0.2],   color: 0x1e293b, x:  0.16,  y: 4.3,  z: 0 },
]

// Indices into PARTS array
const IDX: Record<string, number> = {}
PARTS.forEach((p, i) => { IDX[p.name] = i })

interface JointDef {
  a: string
  b: string
  ax: number; ay: number; az: number
  bx: number; by: number; bz: number
}

const JOINTS: JointDef[] = [
  { a: 'torso',     b: 'head',      ax:  0,     ay:  0.32, az: 0, bx: 0,    by: -0.22, bz: 0 },
  { a: 'torso',     b: 'upperArmL', ax: -0.22,  ay:  0.2,  az: 0, bx: 0,    by:  0.22, bz: 0 },
  { a: 'upperArmL', b: 'lowerArmL', ax:  0,     ay: -0.22, az: 0, bx: 0,    by:  0.2,  bz: 0 },
  { a: 'torso',     b: 'upperArmR', ax:  0.22,  ay:  0.2,  az: 0, bx: 0,    by:  0.22, bz: 0 },
  { a: 'upperArmR', b: 'lowerArmR', ax:  0,     ay: -0.22, az: 0, bx: 0,    by:  0.2,  bz: 0 },
  { a: 'torso',     b: 'upperLegL', ax: -0.16,  ay: -0.32, az: 0, bx: 0,    by:  0.25, bz: 0 },
  { a: 'upperLegL', b: 'lowerLegL', ax:  0,     ay: -0.25, az: 0, bx: 0,    by:  0.23, bz: 0 },
  { a: 'torso',     b: 'upperLegR', ax:  0.16,  ay: -0.32, az: 0, bx: 0,    by:  0.25, bz: 0 },
  { a: 'upperLegR', b: 'lowerLegR', ax:  0,     ay: -0.25, az: 0, bx: 0,    by:  0.23, bz: 0 },
]

// ─── Scene class ──────────────────────────────────────────────────────────────

export class RagdollScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private world: RapierWorld | null = null
  private bodies: RigidBody[] = []
  private meshes: THREE.Mesh[] = []

  private ready      = false
  private resetTimer = 0
  private resetCount = 0

  // Drag state
  private dragBody: RigidBody | null = null
  private dragTarget = new THREE.Vector3()
  private dragPlane  = new THREE.Plane()
  private raycaster  = new THREE.Raycaster()

  private _canvas!: HTMLCanvasElement
  private _onMouseDown!: (e: MouseEvent) => void
  private _onMouseMove!: (e: MouseEvent) => void
  private _onMouseUp!:   ()             => void

  // ─── init ─────────────────────────────────────────────────────────────────

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

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    this.camera.position.set(3, 4, 9)
    this.camera.lookAt(0, 2, 0)

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    const sun = new THREE.DirectionalLight(0xfff4e0, 3.5)
    sun.position.set(6, 10, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near   = 0.5
    sun.shadow.camera.far    = 50
    sun.shadow.camera.left   = sun.shadow.camera.bottom = -16
    sun.shadow.camera.right  = sun.shadow.camera.top    =  16
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x4488ff, 1.2)
    fill.position.set(-6, -4, -8)
    this.scene.add(fill)

    // Drag event listeners
    this._onMouseDown = (e) => this._handleMouseDown(e)
    this._onMouseMove = (e) => this._handleMouseMove(e)
    this._onMouseUp   = ()  => this._handleMouseUp()
    canvas.addEventListener('mousedown', this._onMouseDown)
    canvas.addEventListener('mousemove', this._onMouseMove)
    window.addEventListener('mouseup',   this._onMouseUp)

    initRapier().then(() => this.initPhysics())
  }

  // ─── Physics init ─────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Floor — fixed rigid body
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.4, 0)
    const floorBody = this.world.createRigidBody(floorDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(15, 0.4, 15), floorBody)

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.95 }),
    )
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    this.scene.add(floorMesh)

    // First ragdoll at origin
    this.spawnRagdoll(0, 0)
    this.ready = true
  }

  // ─── Ragdoll helpers ──────────────────────────────────────────────────────

  private spawnRagdoll(xOffset: number, zOffset: number): void {
    const world = this.world!
    const partBodies: RigidBody[] = new Array(PARTS.length)

    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i]
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x + xOffset, p.y, p.z + zOffset)
      const body = world.createRigidBody(bodyDesc)

      let colliderDesc: ReturnType<typeof RAPIER.ColliderDesc.ball>
      if (p.shape === 'ball') {
        colliderDesc = RAPIER.ColliderDesc.ball(p.dims[0])
      } else {
        colliderDesc = RAPIER.ColliderDesc.cuboid(p.dims[0], p.dims[1], p.dims[2])
      }
      world.createCollider(colliderDesc, body)

      // Mesh
      let geo: THREE.BufferGeometry
      if (p.shape === 'ball') {
        geo = new THREE.SphereGeometry(p.geomDims[0], 16, 12)
      } else {
        geo = new THREE.BoxGeometry(p.geomDims[0], p.geomDims[1], p.geomDims[2])
      }
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.05 }),
      )
      mesh.castShadow    = true
      mesh.receiveShadow = true
      this.scene.add(mesh)

      partBodies[i] = body
      this.bodies.push(body)
      this.meshes.push(mesh)
    }

    // Set damping on all parts
    for (const body of partBodies) {
      body.setLinearDamping(0.1)
      body.setAngularDamping(0.3)
    }

    // Joints
    for (const j of JOINTS) {
      const bodyA = partBodies[IDX[j.a]]
      const bodyB = partBodies[IDX[j.b]]
      const jointData = RAPIER.JointData.spherical(
        { x: j.ax, y: j.ay, z: j.az },
        { x: j.bx, y: j.by, z: j.bz },
      )
      world.createImpulseJoint(jointData, bodyA, bodyB, true)
    }

    // Random initial impulse on torso
    const torsoBody = partBodies[IDX['torso']]
    torsoBody.applyImpulse(
      { x: (Math.random() - 0.5) * 3, y: 0, z: (Math.random() - 0.5) * 3 },
      true,
    )
  }

  private clearRagdolls(): void {
    this.dragBody = null
    const world = this.world!
    for (let i = 0; i < this.bodies.length; i++) {
      world.removeRigidBody(this.bodies[i])
      this.meshes[i].geometry.dispose()
      ;(this.meshes[i].material as THREE.Material).dispose()
      this.scene.remove(this.meshes[i])
    }
    this.bodies = []
    this.meshes = []
  }

  private resetRagdoll(): void {
    this.clearRagdolls()
    this.resetCount++

    if (this.resetCount >= 2) {
      for (const xOff of [-2, 0, 2]) {
        this.spawnRagdoll(xOff, 0)
      }
    } else {
      this.spawnRagdoll(0, 0)
    }
  }

  // ─── Drag interaction ─────────────────────────────────────────────────────

  private _handleMouseDown(e: MouseEvent): void {
    if (!this.ready || this.meshes.length === 0) return
    const rect = this._canvas.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    )
    this.raycaster.setFromCamera(mouse, this.camera)
    const hits = this.raycaster.intersectObjects(this.meshes)
    if (hits.length === 0) return

    const idx = this.meshes.indexOf(hits[0].object as THREE.Mesh)
    if (idx === -1) return

    this.dragBody = this.bodies[idx]

    // Drag plane through hit point, facing camera
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point)
    this.dragTarget.copy(hits[0].point)

    this._canvas.style.cursor = 'grabbing'
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this.dragBody) {
      this._canvas.style.cursor = 'grab'
      return
    }
    const rect = this._canvas.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    )
    this.raycaster.setFromCamera(mouse, this.camera)
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
      this.dragTarget.copy(hit)
    }
  }

  private _handleMouseUp(): void {
    this.dragBody = null
    this._canvas.style.cursor = 'grab'
  }

  private _applyDragForce(): void {
    if (!this.dragBody) return
    const pos = this.dragBody.translation()
    const dx  = this.dragTarget.x - pos.x
    const dy  = this.dragTarget.y - pos.y
    const dz  = this.dragTarget.z - pos.z

    // Spring toward target, damp existing velocity
    const vel = this.dragBody.linvel()
    const STIFFNESS = 400
    const DT        = 1 / 60
    this.dragBody.applyImpulse({
      x: dx * STIFFNESS * DT - vel.x * 0.8,
      y: dy * STIFFNESS * DT - vel.y * 0.8 + 9.81 * DT,  // counteract gravity
      z: dz * STIFFNESS * DT - vel.z * 0.8,
    }, true)
    // Damp rotation so the body doesn't spin wildly while grabbed
    const av = this.dragBody.angvel()
    this.dragBody.applyTorqueImpulse({ x: -av.x * 0.5, y: -av.y * 0.5, z: -av.z * 0.5 }, true)
  }

  // ─── SceneModule interface ────────────────────────────────────────────────

  update(_time: number): void {
    if (!this.ready || !this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    this._applyDragForce()
    this.world.step()

    for (let i = 0; i < this.bodies.length; i++) {
      const t = this.bodies[i].translation()
      const r = this.bodies[i].rotation()
      this.meshes[i].position.set(t.x, t.y, t.z)
      this.meshes[i].quaternion.set(r.x, r.y, r.z, r.w)
    }

    // Periodic reset every 10 seconds
    this.resetTimer += 1 / 60
    if (this.resetTimer >= 10) {
      this.resetTimer = 0
      this.resetRagdoll()
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this._canvas.removeEventListener('mousedown', this._onMouseDown)
    this._canvas.removeEventListener('mousemove', this._onMouseMove)
    window.removeEventListener('mouseup', this._onMouseUp)
    this._canvas.style.cursor = ''
    this.renderer.dispose()
    if (this.world) {
      this.world.free()
      this.world = null
    }
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
