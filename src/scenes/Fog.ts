import * as THREE from 'three'
import type { SceneModule } from '../types'

export class FogScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private cameraZ = 8

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()

    // Fog color must match background exactly
    const fogColor = 0x1a1f2e
    this.scene.fog = new THREE.FogExp2(fogColor, 0.1)
    this.scene.background = new THREE.Color(fogColor)

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
    this.camera.position.set(0, 1.8, this.cameraZ)
    this.camera.lookAt(0, 1.8, 0)

    // alpha:false because we have an opaque background
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0x8899bb, 1.2))

    // Spot light — cone of light illuminating the near pillars
    const spot = new THREE.SpotLight(0xaabbdd, 20, 30, Math.PI * 0.2, 0.4)
    spot.position.set(0, 8, 5)
    spot.target.position.set(0, 0, -5)
    this.scene.add(spot)
    this.scene.add(spot.target)

    // Floor
    const floorGeo = new THREE.PlaneGeometry(20, 80)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2d3a4a, roughness: 0.9 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor)

    // Roof
    const roof = floor.clone()
    roof.position.y = 4
    roof.rotation.x = Math.PI / 2
    this.scene.add(roof)

    // Two rows of pillars receding into the fog
    const pillarGeo = new THREE.CylinderGeometry(0.18, 0.2, 4, 8)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 })

    const archGeo = new THREE.TorusGeometry(2.3, 0.08, 8, 32, Math.PI)
    const archMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })

    for (let i = 0; i < 12; i++) {
      const zPos = -i * 4

      const left  = new THREE.Mesh(pillarGeo, pillarMat)
      left.position.set(-2.3, 2, zPos)
      this.scene.add(left)

      const right = new THREE.Mesh(pillarGeo, pillarMat)
      right.position.set(2.3, 2, zPos)
      this.scene.add(right)

      // Arch connecting each pair
      const arch = new THREE.Mesh(archGeo, archMat)
      arch.position.set(0, 4, zPos)
      arch.rotation.z = Math.PI
      this.scene.add(arch)
    }

    // Atmospheric point lights in the distance
    const glowColors = [0x4466ff, 0x6644ff, 0x2244aa]
    glowColors.forEach((color, i) => {
      const l = new THREE.PointLight(color, 3, 8)
      l.position.set(0, 2, -10 - i * 8)
      this.scene.add(l)
    })
  }

  update(_time: number): void {
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
