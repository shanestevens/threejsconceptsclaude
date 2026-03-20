import * as THREE from 'three'
import type { SceneModule } from '../types'

export class MaterialsScene implements SceneModule {
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

    const dirLight = new THREE.DirectionalLight(0xffffff, 3.5)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)

    const rimLight = new THREE.DirectionalLight(0x88aaff, 1.5)
    rimLight.position.set(-5, 0, -5)
    this.scene.add(rimLight)

    const pointLight = new THREE.PointLight(0x10b981, 6, 20)
    pointLight.position.set(-3, 2, 3)
    this.scene.add(pointLight)

    const color = 0x10b981
    const configs: THREE.Material[] = [
      new THREE.MeshBasicMaterial({ color, wireframe: true }),
      new THREE.MeshLambertMaterial({ color }),
      new THREE.MeshPhongMaterial({ color, shininess: 140 }),
      new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.15 }),
    ]
    const xPositions = [-3.2, -1.1, 1.1, 3.2]

    configs.forEach((mat, i) => {
      const geo = new THREE.SphereGeometry(0.7, 64, 64)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = xPositions[i]
      this.scene.add(mesh)
      this.meshes.push(mesh)
    })
  }

  update(time: number): void {
    this.meshes.forEach((mesh) => {
      mesh.rotation.y = time * 0.5
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
