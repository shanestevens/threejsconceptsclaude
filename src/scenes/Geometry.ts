import * as THREE from 'three'
import type { SceneModule } from '../types'

export class GeometryScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 6)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x8888ff, 1.0)
    fillLight.position.set(-5, -2, -3)
    this.scene.add(fillLight)

    const configs: { geo: THREE.BufferGeometry; color: number; x: number }[] = [
      { geo: new THREE.TetrahedronGeometry(0.8), color: 0xf59e0b, x: -3.2 },
      { geo: new THREE.SphereGeometry(0.7, 32, 32), color: 0x10b981, x: -1.1 },
      { geo: new THREE.TorusGeometry(0.6, 0.25, 16, 48), color: 0xf43f5e, x: 1.1 },
      { geo: new THREE.ConeGeometry(0.7, 1.4, 6), color: 0xa855f7, x: 3.2 },
    ]

    configs.forEach(({ geo, color, x }) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = x

      // White edges for clarity
      const edges = new THREE.EdgesGeometry(geo)
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
      mesh.add(new THREE.LineSegments(edges, lineMat))

      this.scene.add(mesh)
      this.meshes.push(mesh)
    })
  }

  update(time: number): void {
    this.meshes.forEach((mesh, i) => {
      mesh.rotation.x = time * (0.3 + i * 0.07)
      mesh.rotation.y = time * (0.5 + i * 0.05)
    })
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
