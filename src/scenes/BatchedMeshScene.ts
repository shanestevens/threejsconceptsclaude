import * as THREE from 'three'
import type { SceneModule } from '../types'

const PER_TYPE   = 120    // instances per geometry type
const SPREAD     = 9      // ±9 units on each axis
const HOVER_COL  = new THREE.Color(0xffffff)

// Per-type accent colours
const TYPE_COLORS = [
  new THREE.Color(0x6366f1),  // indigo   – spheres
  new THREE.Color(0xf97316),  // orange   – boxes
  new THREE.Color(0x22c55e),  // green    – cylinders
  new THREE.Color(0xec4899),  // pink     – cones
  new THREE.Color(0x06b6d4),  // cyan     – torus knots
]

export class BatchedMeshScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera
  private group!:    THREE.Group
  private batch!:    THREE.BatchedMesh
  private canvas!:   HTMLCanvasElement

  private raycaster  = new THREE.Raycaster()
  private mouse      = new THREE.Vector2(-9999, -9999)
  private hoveredId  = -1
  private baseColors: THREE.Color[] = []

  private onMouseMove!: (e: MouseEvent) => void
  private onMouseLeave!: () => void

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200)
    this.camera.position.set(0, 10, 24)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const sun = new THREE.DirectionalLight(0xffffff, 3.5)
    sun.position.set(12, 16, 12)
    this.scene.add(sun)
    const rim = new THREE.DirectionalLight(0x88aaff, 1.5)
    rim.position.set(-12, -6, -12)
    this.scene.add(rim)

    // ── Geometries (high-detail; LOD versions could swap via setGeometryIdAt) ─
    const geos = [
      new THREE.SphereGeometry(0.30, 18, 14),
      new THREE.BoxGeometry(0.52, 0.52, 0.52),
      new THREE.CylinderGeometry(0.18, 0.24, 0.60, 14),
      new THREE.ConeGeometry(0.34, 0.65, 14),
      new THREE.TorusKnotGeometry(0.20, 0.07, 64, 8),
    ]

    // Compute totals for BatchedMesh allocation
    let maxVerts = 0, maxIdx = 0
    geos.forEach(g => {
      maxVerts += g.attributes.position.count
      maxIdx   += (g.index?.count ?? g.attributes.position.count)
    })

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, vertexColors: true })
    const totalInstances = TYPE_COLORS.length * PER_TYPE

    this.batch = new THREE.BatchedMesh(totalInstances, maxVerts + 512, maxIdx + 1024, mat)

    const geoIds = geos.map(g => this.batch.addGeometry(g))

    // ── Populate instances ─────────────────────────────────────────────────────
    const m4   = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos  = new THREE.Vector3()
    const scl  = new THREE.Vector3(1, 1, 1)

    for (let t = 0; t < TYPE_COLORS.length; t++) {
      for (let i = 0; i < PER_TYPE; i++) {
        const iid = this.batch.addInstance(geoIds[t])

        pos.set(
          (Math.random() - 0.5) * SPREAD * 2,
          (Math.random() - 0.5) * SPREAD * 2,
          (Math.random() - 0.5) * SPREAD * 2,
        )
        quat.setFromEuler(new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ))
        m4.compose(pos, quat, scl)
        this.batch.setMatrixAt(iid, m4)

        // Slight brightness variation per instance
        const col = TYPE_COLORS[t].clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15)
        this.batch.setColorAt(iid, col)
        this.baseColors[iid] = col
      }
    }

    this.group = new THREE.Group()
    this.group.add(this.batch)
    this.scene.add(this.group)

    // ── Mouse picking ──────────────────────────────────────────────────────────
    this.onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      this.mouse.set(
        ((e.clientX - r.left)  / r.width)  * 2 - 1,
        -((e.clientY - r.top)  / r.height) * 2 + 1,
      )
    }
    this.onMouseLeave = () => {
      this.mouse.set(-9999, -9999)
      if (this.hoveredId >= 0) {
        this.batch.setColorAt(this.hoveredId, this.baseColors[this.hoveredId])
        this.hoveredId = -1
      }
    }
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseleave', this.onMouseLeave)
  }

  update(time: number): void {
    this.group.rotation.y = time * 0.07
    this.group.rotation.x = Math.sin(time * 0.04) * 0.18

    // Hover raycasting
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const hits = this.raycaster.intersectObject(this.batch)
    const hit  = hits[0] as (THREE.Intersection & { batchId?: number }) | undefined
    const newId: number = hit?.batchId ?? (hit as any)?.instanceId ?? -1

    if (newId !== this.hoveredId) {
      if (this.hoveredId >= 0)
        this.batch.setColorAt(this.hoveredId, this.baseColors[this.hoveredId])
      if (newId >= 0)
        this.batch.setColorAt(newId, HOVER_COL)
      this.hoveredId = newId
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
