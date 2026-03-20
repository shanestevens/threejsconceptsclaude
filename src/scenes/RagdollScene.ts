import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

type RapierWorld = InstanceType<typeof RAPIER.World>
type RigidBody   = ReturnType<RapierWorld['createRigidBody']>

// ─── Ragdoll definition ───────────────────────────────────────────────────────

interface PartDef {
  name: string
  shape: 'ball' | 'cuboid'
  dims: number[]
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

const IDX: Record<string, number> = {}
PARTS.forEach((p, i) => { IDX[p.name] = i })

interface JointDef {
  a: string; b: string
  ax: number; ay: number; az: number
  bx: number; by: number; bz: number
}

const JOINTS: JointDef[] = [
  { a: 'torso',     b: 'head',      ax:  0,    ay:  0.32, az: 0, bx: 0, by: -0.22, bz: 0 },
  { a: 'torso',     b: 'upperArmL', ax: -0.22, ay:  0.2,  az: 0, bx: 0, by:  0.22, bz: 0 },
  { a: 'upperArmL', b: 'lowerArmL', ax:  0,    ay: -0.22, az: 0, bx: 0, by:  0.2,  bz: 0 },
  { a: 'torso',     b: 'upperArmR', ax:  0.22, ay:  0.2,  az: 0, bx: 0, by:  0.22, bz: 0 },
  { a: 'upperArmR', b: 'lowerArmR', ax:  0,    ay: -0.22, az: 0, bx: 0, by:  0.2,  bz: 0 },
  { a: 'torso',     b: 'upperLegL', ax: -0.16, ay: -0.32, az: 0, bx: 0, by:  0.25, bz: 0 },
  { a: 'upperLegL', b: 'lowerLegL', ax:  0,    ay: -0.25, az: 0, bx: 0, by:  0.23, bz: 0 },
  { a: 'torso',     b: 'upperLegR', ax:  0.16, ay: -0.32, az: 0, bx: 0, by:  0.25, bz: 0 },
  { a: 'upperLegR', b: 'lowerLegR', ax:  0,    ay: -0.25, az: 0, bx: 0, by:  0.23, bz: 0 },
]

// ─── Obstacle layout ──────────────────────────────────────────────────────────

interface BoxDef { x: number; y: number; z: number; w: number; h: number; d: number }

const OBSTACLES: BoxDef[] = [
  { x:  0.0, y: 0.5, z:  0.0, w: 2.4, h: 1.0, d: 2.4 },   // central plinth
  { x: -2.2, y: 0.3, z:  1.0, w: 1.0, h: 0.6, d: 1.0 },   // left low box
  { x:  2.2, y: 0.3, z: -0.5, w: 1.0, h: 0.6, d: 1.0 },   // right low box
  { x:  0.0, y: 0.2, z: -2.5, w: 3.0, h: 0.4, d: 0.8 },   // back ledge
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

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    this.camera.position.set(5, 7, 12)
    this.camera.lookAt(0, 2, 0)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    const sun = new THREE.DirectionalLight(0xfff4e0, 3.5)
    sun.position.set(6, 10, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near   = 0.5
    sun.shadow.camera.far    = 50
    sun.shadow.camera.left   = sun.shadow.camera.bottom = -12
    sun.shadow.camera.right  = sun.shadow.camera.top    =  12
    this.scene.add(sun)

    this.scene.add(new THREE.DirectionalLight(0x4488ff, 1.2).position.set(-6, -4, -8) && sun)
    const fill = new THREE.DirectionalLight(0x4488ff, 1.2)
    fill.position.set(-6, -4, -8)
    this.scene.add(fill)

    initRapier().then(() => this.initPhysics())
  }

  private initPhysics(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Floor
    const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.4, 0))
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(15, 0.4, 15), floorBody)

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.95 }),
    )
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    this.scene.add(floorMesh)

    // Static obstacle boxes
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.1 })
    for (const o of OBSTACLES) {
      const hx = o.w / 2, hy = o.h / 2, hz = o.d / 2
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(o.x, o.y, o.z))
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), boxMat)
      mesh.position.set(o.x, o.y, o.z)
      mesh.castShadow = mesh.receiveShadow = true
      this.scene.add(mesh)
    }

    this.spawnRagdoll(0, 0)
    this.ready = true
  }

  private spawnRagdoll(xOffset: number, zOffset: number): void {
    const world = this.world!
    const partBodies: RigidBody[] = new Array(PARTS.length)

    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i]
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x + xOffset, p.y, p.z + zOffset),
      )

      if (p.shape === 'ball') {
        world.createCollider(RAPIER.ColliderDesc.ball(p.dims[0]), body)
      } else {
        world.createCollider(RAPIER.ColliderDesc.cuboid(p.dims[0], p.dims[1], p.dims[2]), body)
      }

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
      mesh.castShadow = mesh.receiveShadow = true
      this.scene.add(mesh)

      partBodies[i] = body
      this.bodies.push(body)
      this.meshes.push(mesh)
    }

    for (const body of partBodies) {
      body.setLinearDamping(0.1)
      body.setAngularDamping(0.3)
    }

    for (const j of JOINTS) {
      world.createImpulseJoint(
        RAPIER.JointData.spherical(
          { x: j.ax, y: j.ay, z: j.az },
          { x: j.bx, y: j.by, z: j.bz },
        ),
        partBodies[IDX[j.a]],
        partBodies[IDX[j.b]],
        true,
      )
    }

    // Small random nudge so it doesn't fall perfectly straight
    partBodies[IDX['torso']].applyImpulse(
      { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 },
      true,
    )
  }

  private clearRagdolls(): void {
    for (let i = 0; i < this.bodies.length; i++) {
      this.world!.removeRigidBody(this.bodies[i])
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
      for (const xOff of [-2, 0, 2]) this.spawnRagdoll(xOff, 0)
    } else {
      this.spawnRagdoll(0, 0)
    }
  }

  update(_time: number): void {
    if (!this.ready || !this.world) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    this.world.step()

    for (let i = 0; i < this.bodies.length; i++) {
      const t = this.bodies[i].translation()
      const r = this.bodies[i].rotation()
      this.meshes[i].position.set(t.x, t.y, t.z)
      this.meshes[i].quaternion.set(r.x, r.y, r.z, r.w)
    }

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
    this.renderer.dispose()
    if (this.world) { this.world.free(); this.world = null }
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
