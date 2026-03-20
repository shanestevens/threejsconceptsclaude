import * as THREE from 'three'
import type { SceneModule } from '../types'

export class LightingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private lights: THREE.PointLight[] = []
  private lightHelpers: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 2, 5)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Decent ambient so the scene isn't pitch black between lights
    this.scene.add(new THREE.AmbientLight(0x334466, 1.0))

    // Central object — dark but reflective so colored lights are visible
    const geo = new THREE.SphereGeometry(0.8, 64, 64)
    const mat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.25, metalness: 0.7 })
    this.scene.add(new THREE.Mesh(geo, mat))

    // Floor
    const floorGeo = new THREE.PlaneGeometry(12, 12)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.2
    this.scene.add(floor)

    // Three vivid orbiting point lights
    const lightConfigs = [
      { color: 0xf97316, radius: 2.5, speed: 1.0, phase: 0 },
      { color: 0xec4899, radius: 2.5, speed: 0.7, phase: (Math.PI * 2) / 3 },
      { color: 0x06b6d4, radius: 2.5, speed: 1.3, phase: (Math.PI * 4) / 3 },
    ]

    lightConfigs.forEach(({ color, radius, speed, phase }) => {
      const light = new THREE.PointLight(color, 8, 10)
      light.userData = { radius, phase, speed }
      this.lights.push(light)
      this.scene.add(light)

      // Glowing sphere to mark light position
      const helperGeo = new THREE.SphereGeometry(0.1, 16, 16)
      const helperMat = new THREE.MeshBasicMaterial({ color })
      const helper = new THREE.Mesh(helperGeo, helperMat)
      this.lightHelpers.push(helper)
      this.scene.add(helper)
    })
  }

  update(time: number): void {
    this.lights.forEach((light, i) => {
      const { radius, phase, speed } = light.userData as { radius: number; phase: number; speed: number }
      const angle = time * speed + phase
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        1.0 + Math.sin(time * 0.8 + i) * 0.6,
        Math.sin(angle) * radius
      )
      light.position.copy(pos)
      this.lightHelpers[i].position.copy(pos)
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
