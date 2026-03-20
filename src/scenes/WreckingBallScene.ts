import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

interface BoxObject {
  body: InstanceType<typeof RAPIER.RigidBody>
  mesh: THREE.Mesh
}

export class WreckingBallScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private world!: InstanceType<typeof RAPIER.World>

  private boxes: BoxObject[] = []
  private ballBody!: InstanceType<typeof RAPIER.RigidBody>
  private ballMesh!: THREE.Mesh
  private pivotMesh!: THREE.Mesh
  private ropeLine!: THREE.Line
  private ropePositions!: Float32Array

  private readonly pivotY = 10
  private readonly ropeLength = 7
  private readonly wallZ = -4

  private lastTime = 0
  private resetTimer = 0
  private ready = false

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Scene & camera
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 5, 16)
    this.camera.lookAt(0, 3, 0)

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const sun = new THREE.DirectionalLight(0xfff0cc, 3.5)
    sun.position.set(8, 12, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 60
    sun.shadow.camera.left = -20
    sun.shadow.camera.right = 20
    sun.shadow.camera.top = 20
    sun.shadow.camera.bottom = -20
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x4466ff, 1.0)
    fill.position.set(-8, -4, -8)
    this.scene.add(fill)

    // Async physics init
    initRapier().then(() => {
      this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
      this._buildScene()
      this.ready = true
    })
  }

  private _buildScene(): void {
    this._buildFloor()
    this._buildWall()
    this._buildBall()
    this._buildRope()
    this._buildPivot()
  }

  private _buildFloor(): void {
    // Physics floor
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.4, 0)
    const floorBody = this.world.createRigidBody(floorDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.4, 20), floorBody)

    // Visual floor
    const geo = new THREE.PlaneGeometry(40, 40)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.05,
    })
    const floor = new THREE.Mesh(geo, mat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    this.scene.add(floor)

    // Grid lines on floor
    const gridHelper = new THREE.GridHelper(40, 40, 0x333355, 0x222244)
    gridHelper.position.y = 0.001
    this.scene.add(gridHelper)
  }

  private _buildWall(): void {
    const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9)

    for (let row = 0; row <= 8; row++) {
      for (let col = -3; col <= 3; col++) {
        const x = col * 0.95
        const y = row * 0.95 + 0.45
        const z = this.wallZ

        // Physics
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
        const body = this.world.createRigidBody(bodyDesc)
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45), body)

        // Visual — rainbow wall
        const hue = ((col + 3) / 6) * 360
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(`hsl(${hue}, 70%, 55%)`),
          roughness: 0.6,
          metalness: 0.1,
        })
        const mesh = new THREE.Mesh(boxGeo, mat)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)

        this.boxes.push({ body, mesh })
      }
    }
  }

  private _buildBall(): void {
    // Physics — kinematic
    const ballDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, this.pivotY - this.ropeLength, this.wallZ)
    this.ballBody = this.world.createRigidBody(ballDesc)
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.6), this.ballBody)

    // Visual
    const geo = new THREE.SphereGeometry(0.6, 24, 24)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.8,
    })
    this.ballMesh = new THREE.Mesh(geo, mat)
    this.ballMesh.castShadow = true
    this.scene.add(this.ballMesh)
  }

  private _buildRope(): void {
    // Two points: pivot and ball — updated each frame
    this.ropePositions = new Float32Array(6)
    const ropeGeo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(this.ropePositions, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    ropeGeo.setAttribute('position', posAttr)

    const ropeMat = new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 2 })
    this.ropeLine = new THREE.Line(ropeGeo, ropeMat)
    this.scene.add(this.ropeLine)
  }

  private _buildPivot(): void {
    const geo = new THREE.SphereGeometry(0.18, 12, 12)
    const mat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.5, metalness: 0.6 })
    this.pivotMesh = new THREE.Mesh(geo, mat)
    this.pivotMesh.position.set(0, this.pivotY, this.wallZ)
    this.scene.add(this.pivotMesh)

    // Support beam visual
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, this.pivotY + 1, 8)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 })
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.set(0, (this.pivotY + 1) / 2, this.wallZ)
    this.scene.add(beam)
  }

  private _clearWall(): void {
    for (const { body, mesh } of this.boxes) {
      this.world.removeRigidBody(body)
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.boxes = []
  }

  update(time: number): void {
    if (!this.ready) return

    const dt = Math.min(time - this.lastTime, 0.05)
    this.lastTime = time
    this.resetTimer += dt

    // Reset wall every 15 seconds
    if (this.resetTimer > 15) {
      this._clearWall()
      this._buildWall()
      this.resetTimer = 0
    }

    // Pendulum angle
    const angle = Math.sin(time * 1.1) * 1.1

    // Ball position
    const bx = Math.sin(angle) * this.ropeLength
    const by = this.pivotY - Math.cos(angle) * this.ropeLength
    const bz = this.wallZ

    this.ballBody.setNextKinematicTranslation({ x: bx, y: by, z: bz })

    // Step physics
    this.world.step()

    // Sync ball mesh
    this.ballMesh.position.set(bx, by, bz)

    // Update rope geometry
    this.ropePositions[0] = 0
    this.ropePositions[1] = this.pivotY
    this.ropePositions[2] = this.wallZ
    this.ropePositions[3] = bx
    this.ropePositions[4] = by
    this.ropePositions[5] = bz
    const posAttr = this.ropeLine.geometry.getAttribute('position') as THREE.BufferAttribute
    posAttr.needsUpdate = true

    // Sync box meshes
    const quat = new THREE.Quaternion()
    for (const { body, mesh } of this.boxes) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      quat.set(r.x, r.y, r.z, r.w)
      mesh.quaternion.copy(quat)
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.world?.free()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
