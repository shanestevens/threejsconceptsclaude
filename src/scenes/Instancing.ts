import * as THREE from 'three'
import type { SceneModule } from '../types'

export class InstancingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private mesh!: THREE.InstancedMesh
  private dummy = new THREE.Object3D()

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 7)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)
    const rimLight = new THREE.DirectionalLight(0xaaccff, 1.0)
    rimLight.position.set(-5, -3, -5)
    this.scene.add(rimLight)

    const count = 512  // 8×8×8
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 })

    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const color = new THREE.Color()
    let idx = 0
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          this.dummy.position.set((x - 3.5) * 0.55, (y - 3.5) * 0.55, (z - 3.5) * 0.55)
          this.dummy.updateMatrix()
          this.mesh.setMatrixAt(idx, this.dummy.matrix)
          // HSL rainbow — hue based on index, full saturation
          color.setHSL(idx / count, 0.9, 0.6)
          this.mesh.setColorAt(idx, color)
          idx++
        }
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true

    this.scene.add(this.mesh)
  }

  update(time: number): void {
    this.mesh.rotation.x = time * 0.18
    this.mesh.rotation.y = time * 0.28
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
