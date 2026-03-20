import * as THREE from 'three'
import type { SceneModule } from '../types'

export class ShadowsScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private light!: THREE.DirectionalLight
  private sphere!: THREE.Mesh
  private cube!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(3, 3.5, 5)
    this.camera.lookAt(0, 0.5, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene.add(new THREE.AmbientLight(0x6688aa, 1.2))

    this.light = new THREE.DirectionalLight(0xfff5e0, 3.5)
    this.light.position.set(4, 6, 3)
    this.light.castShadow = true
    this.light.shadow.mapSize.width = 2048
    this.light.shadow.mapSize.height = 2048
    this.light.shadow.camera.near = 0.5
    this.light.shadow.camera.far = 30
    this.light.shadow.camera.left = -5
    this.light.shadow.camera.right = 5
    this.light.shadow.camera.top = 5
    this.light.shadow.camera.bottom = -5
    this.light.shadow.bias = -0.001
    this.scene.add(this.light)

    // Floor — lighter so shadows are clearly visible
    const floorGeo = new THREE.PlaneGeometry(12, 12)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1
    floor.receiveShadow = true
    this.scene.add(floor)

    // Vivid sphere
    const sphereGeo = new THREE.SphereGeometry(0.7, 64, 64)
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.3, metalness: 0.4 })
    this.sphere = new THREE.Mesh(sphereGeo, sphereMat)
    this.sphere.castShadow = true
    this.sphere.receiveShadow = true
    this.sphere.position.set(-1.2, 0, 0)
    this.scene.add(this.sphere)

    // Vivid cube
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1)
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.3 })
    this.cube = new THREE.Mesh(cubeGeo, cubeMat)
    this.cube.castShadow = true
    this.cube.receiveShadow = true
    this.cube.position.set(1.2, 0, 0)
    this.scene.add(this.cube)
  }

  update(time: number): void {
    this.light.position.x = Math.sin(time * 0.5) * 5
    this.light.position.z = Math.cos(time * 0.5) * 4
    this.sphere.position.y = Math.sin(time * 1.2) * 0.5
    this.cube.rotation.y = time * 0.8
    this.cube.rotation.x = time * 0.4
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
