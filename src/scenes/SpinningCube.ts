import * as THREE from 'three'
import type { SceneModule } from '../types'

export class SpinningCube implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private cube!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 3)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4)

    // Six vivid face colors
    const faceColors = [0xef4444, 0xf97316, 0xeab308, 0x22c55e, 0x6366f1, 0xa855f7]
    const materials = faceColors.map((c) => new THREE.MeshBasicMaterial({ color: c }))

    this.cube = new THREE.Mesh(geometry, materials)

    // White edge overlay
    const edges = new THREE.EdgesGeometry(geometry)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 })
    this.cube.add(new THREE.LineSegments(edges, lineMat))

    this.scene.add(this.cube)
  }

  update(time: number): void {
    this.cube.rotation.x = time * 0.4
    this.cube.rotation.y = time * 0.6
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
