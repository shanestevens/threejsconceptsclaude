import * as THREE from 'three'
import type { SceneModule } from '../types'

export class RenderTargetScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private outerScene!: THREE.Scene
  private innerScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private innerCamera!: THREE.PerspectiveCamera
  private rt!: THREE.WebGLRenderTarget
  private innerMeshes: THREE.Mesh[] = []
  private screen!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.outerScene = new THREE.Scene()
    this.innerScene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0.5, 4)
    this.camera.lookAt(0, 0, 0)

    this.innerCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100)
    this.innerCamera.position.set(0, 0, 3)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.rt = new THREE.WebGLRenderTarget(512, 288, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // ── Inner scene (rendered to texture) ────────────────────
    this.innerScene.background = new THREE.Color(0x0a0a18)
    this.innerScene.add(new THREE.AmbientLight(0x334466, 1.0))

    const innerLights = [
      { color: 0xf97316, pos: [2, 1, 1] as [number, number, number] },
      { color: 0x6366f1, pos: [-2, 1, 1] as [number, number, number] },
      { color: 0x22c55e, pos: [0, -1, 2] as [number, number, number] },
    ]
    innerLights.forEach(({ color, pos }) => {
      const l = new THREE.PointLight(color, 5, 8)
      l.position.set(...pos)
      this.innerScene.add(l)
    })

    const shapes: THREE.Mesh[] = []
    ;[
      { geo: new THREE.TorusKnotGeometry(0.5, 0.18, 64, 8), color: 0xf97316, x: -1.2 },
      { geo: new THREE.SphereGeometry(0.5, 32, 32), color: 0x6366f1, x: 0 },
      { geo: new THREE.OctahedronGeometry(0.5), color: 0x22c55e, x: 1.2 },
    ].forEach(({ geo, color, x }) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = x
      this.innerScene.add(mesh)
      shapes.push(mesh)
    })
    this.innerMeshes = shapes

    // ── Outer scene ───────────────────────────────────────────
    this.outerScene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const outerDir = new THREE.DirectionalLight(0xffffff, 2.0)
    outerDir.position.set(5, 5, 5)
    this.outerScene.add(outerDir)

    // Monitor/screen using rt texture
    const screenGeo = new THREE.BoxGeometry(3.2, 2, 0.15)
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
    const monitor = new THREE.Mesh(screenGeo, screenMat)
    this.outerScene.add(monitor)

    const displayGeo = new THREE.PlaneGeometry(2.9, 1.7)
    const displayMat = new THREE.MeshBasicMaterial({ map: this.rt.texture })
    this.screen = new THREE.Mesh(displayGeo, displayMat)
    this.screen.position.z = 0.085
    monitor.add(this.screen)

    // Stand
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8), standMat)
    pole.position.y = -1.4
    this.outerScene.add(pole)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05), standMat)
    base.position.y = -1.8
    this.outerScene.add(base)
  }

  update(time: number): void {
    this.innerMeshes.forEach((m, i) => {
      m.rotation.x = time * (0.4 + i * 0.1)
      m.rotation.y = time * (0.5 + i * 0.15)
    })

    // Render inner scene to texture
    this.renderer.setRenderTarget(this.rt)
    this.renderer.render(this.innerScene, this.innerCamera)

    // Render outer scene to canvas
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.outerScene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.rt.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
