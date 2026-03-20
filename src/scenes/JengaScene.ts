import * as THREE from 'three'
import type { SceneModule } from '../types'
import { initRapier, RAPIER } from '../rapierHelper'

interface BlockObject {
  body: InstanceType<typeof RAPIER.RigidBody>
  mesh: THREE.Mesh
}

export class JengaScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private world!: InstanceType<typeof RAPIER.World>

  private blocks: BlockObject[] = []
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2(-9999, -9999)
  private hoveredMesh: THREE.Mesh | null = null

  private resetTimer = 0
  private ready = false
  private lastTime = 0

  // Bound event handlers — stored so we can remove them in destroy
  private _onMouseMove!: (e: MouseEvent) => void
  private _onClick!: (e: MouseEvent) => void
  private _canvas!: HTMLCanvasElement

  init(canvas: HTMLCanvasElement): void {
    this._canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Scene & camera
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    this.camera.position.set(5, 6, 10)
    this.camera.lookAt(0, 3, 0)

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    const sun = new THREE.DirectionalLight(0xfff8e0, 3.0)
    sun.position.set(6, 10, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 50
    sun.shadow.camera.left = -10
    sun.shadow.camera.right = 10
    sun.shadow.camera.top = 15
    sun.shadow.camera.bottom = -5
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x6688ff, 1.2)
    fill.position.set(-6, -4, -6)
    this.scene.add(fill)

    // Event listeners
    this._onMouseMove = (e: MouseEvent) => this._handleMouseMove(e)
    this._onClick = (e: MouseEvent) => this._handleClick(e)
    canvas.addEventListener('mousemove', this._onMouseMove)
    canvas.addEventListener('click', this._onClick)

    // Async physics init
    initRapier().then(() => {
      this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
      this._buildScene()
      this.ready = true
    })
  }

  private _buildScene(): void {
    this._buildFloor()
    this._buildTower()
  }

  private _buildFloor(): void {
    // Physics floor
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.3, 0)
    const floorBody = this.world.createRigidBody(floorDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(15, 0.3, 15), floorBody)

    // Visual floor
    const geo = new THREE.PlaneGeometry(30, 30)
    const mat = new THREE.MeshStandardMaterial({ color: 0x1e1e2a, roughness: 0.95, metalness: 0.0 })
    const floor = new THREE.Mesh(geo, mat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)

    const grid = new THREE.GridHelper(30, 30, 0x333355, 0x222244)
    grid.position.y = 0.001
    this.scene.add(grid)
  }

  private _buildTower(): void {
    const blockGeo = new THREE.BoxGeometry(1.8, 0.28, 0.6)
    const LAYERS = 18

    for (let layer = 0; layer < LAYERS; layer++) {
      const y = layer * 0.28 + 0.14
      const isXRow = layer % 2 === 0   // even layers: blocks along X (z=0, x varies)

      for (let slot = 0; slot < 3; slot++) {
        let x = 0
        let z = 0
        let rotY = 0

        if (isXRow) {
          // Blocks extend along X; three are placed side-by-side in Z
          x = 0
          z = (slot - 1) * 0.6
          rotY = 0
        } else {
          // Blocks extend along Z (rotated 90°); three placed side-by-side in X
          x = (slot - 1) * 0.6
          z = 0
          rotY = Math.PI / 2
        }

        // Wood color with slight per-block variation
        const hue = 30
        const lightness = 50 + (Math.random() * 10 - 5)
        const saturation = 60 + (Math.random() * 10 - 5)
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`),
          roughness: 0.8,
          metalness: 0.0,
        })

        const mesh = new THREE.Mesh(blockGeo, mat)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)

        // Physics body
        const q = new THREE.Quaternion()
        q.setFromEuler(new THREE.Euler(0, rotY, 0))

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        const body = this.world.createRigidBody(bodyDesc)

        // Half extents: (0.9, 0.14, 0.3) but rotated blocks swap x/z
        // The collider is defined in body-local space, so we always use (0.9, 0.14, 0.3)
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.14, 0.3), body)

        this.blocks.push({ body, mesh })
      }
    }
  }

  private _getMeshArray(): THREE.Mesh[] {
    return this.blocks.map(b => b.mesh)
  }

  private _handleMouseMove(e: MouseEvent): void {
    const rect = this._canvas.getBoundingClientRect()
    this.mouse.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  private _handleClick(e: MouseEvent): void {
    if (!this.ready) return
    const rect = this._canvas.getBoundingClientRect()
    const clickMouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(clickMouse, this.camera)
    const hits = this.raycaster.intersectObjects(this._getMeshArray())
    if (hits.length === 0) return

    const hitMesh = hits[0].object as THREE.Mesh
    const block = this.blocks.find(b => b.mesh === hitMesh)
    if (!block) return

    block.body.applyImpulse(
      {
        x: (Math.random() - 0.5) * 8,
        y: 2,
        z: (Math.random() - 0.5) * 8,
      },
      true
    )
  }

  private _updateHover(): void {
    if (!this.ready) return
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const meshes = this._getMeshArray()
    const hits = this.raycaster.intersectObjects(meshes)

    const newHovered = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null

    // Unhighlight previous
    if (this.hoveredMesh && this.hoveredMesh !== newHovered) {
      const mat = this.hoveredMesh.material as THREE.MeshStandardMaterial
      mat.emissive.setHex(0x000000)
    }

    // Highlight new
    if (newHovered && newHovered !== this.hoveredMesh) {
      const mat = newHovered.material as THREE.MeshStandardMaterial
      mat.emissive.setHex(0x222222)
    }

    this.hoveredMesh = newHovered
    this._canvas.style.cursor = newHovered ? 'pointer' : ''
  }

  private _clearTower(): void {
    for (const { body, mesh } of this.blocks) {
      this.world.removeRigidBody(body)
      this.scene.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
    }
    this.blocks = []
    // Geometry is shared across all blocks via the local blockGeo — we only dispose materials above.
    // (blockGeo is a local in _buildTower, so it gets GC'd once all meshes are removed.)
  }

  update(time: number): void {
    if (!this.ready) return

    const dt = Math.min(time - this.lastTime, 0.05)
    this.lastTime = time
    this.resetTimer += dt

    // Auto-reset every 20 seconds
    if (this.resetTimer > 20) {
      if (this.hoveredMesh) {
        const mat = this.hoveredMesh.material as THREE.MeshStandardMaterial
        mat.emissive.setHex(0x000000)
        this.hoveredMesh = null
      }
      this._clearTower()
      this._buildTower()
      this.resetTimer = 0
    }

    // Step physics
    this.world.step()

    // Sync meshes
    const quat = new THREE.Quaternion()
    for (const { body, mesh } of this.blocks) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      quat.set(r.x, r.y, r.z, r.w)
      mesh.quaternion.copy(quat)
    }

    // Hover highlight
    this._updateHover()

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this._canvas.removeEventListener('mousemove', this._onMouseMove)
    this._canvas.removeEventListener('click', this._onClick)
    this._canvas.style.cursor = ''
    this.world?.free()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
