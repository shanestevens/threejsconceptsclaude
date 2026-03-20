import * as THREE from 'three'
import type { SceneModule } from '../types'

export class SceneGraphScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private solarSystem!: THREE.Group
  private earthOrbit!: THREE.Group
  private moonOrbit!: THREE.Group
  private earth!: THREE.Mesh
  private sun!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 5, 8)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Dim ambient — sun provides the main light
    this.scene.add(new THREE.AmbientLight(0x223344, 0.8))

    this.solarSystem = new THREE.Group()
    this.scene.add(this.solarSystem)

    // ── Sun ──────────────────────────────────────────────────
    const sunMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xeab308,
      emissiveIntensity: 1.0,
      roughness: 0.9,
    })
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), sunMat)
    this.solarSystem.add(this.sun)

    // Point light from sun — illuminates planets
    const sunLight = new THREE.PointLight(0xffd47a, 10, 30)
    this.sun.add(sunLight)

    // ── Earth orbit (group rotates → earth circles the sun) ──
    this.earthOrbit = new THREE.Group()
    this.solarSystem.add(this.earthOrbit)

    // Orbit ring visualisation
    const orbitRingGeo = new THREE.TorusGeometry(2.5, 0.01, 8, 80)
    const orbitRingMat = new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.5 })
    this.earthOrbit.add(new THREE.Mesh(orbitRingGeo, orbitRingMat))

    const earthMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7, metalness: 0.1 })
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), earthMat)
    this.earth.position.x = 2.5
    this.earthOrbit.add(this.earth)

    // ── Moon orbit (group lives at earth's x position, rotates → moon circles earth) ──
    this.moonOrbit = new THREE.Group()
    this.moonOrbit.position.x = 2.5  // co-located with earth
    this.earthOrbit.add(this.moonOrbit)

    // Moon orbit ring
    const moonRingGeo = new THREE.TorusGeometry(0.65, 0.008, 8, 48)
    const moonRingMat = new THREE.MeshBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.4 })
    this.moonOrbit.add(new THREE.Mesh(moonRingGeo, moonRingMat))

    const moonMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 })
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), moonMat)
    moon.position.x = 0.65
    this.moonOrbit.add(moon)

    // ── Mars (extra planet for visual richness) ─────────────
    const marsOrbit = new THREE.Group()
    this.solarSystem.add(marsOrbit)

    const marsRingGeo = new THREE.TorusGeometry(3.8, 0.01, 8, 100)
    marsOrbit.add(new THREE.Mesh(marsRingGeo, orbitRingMat.clone()))

    const marsMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.8 })
    const mars = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 32), marsMat)
    mars.position.x = 3.8
    marsOrbit.add(mars)
    marsOrbit.userData.speed = 0.3
    this.solarSystem.userData.marsOrbit = marsOrbit
  }

  update(time: number): void {
    this.sun.rotation.y = time * 0.2
    this.earthOrbit.rotation.y = time * 0.5
    this.earth.rotation.y = time * 1.0
    this.moonOrbit.rotation.y = time * 2.2

    const marsOrbit = this.solarSystem.userData.marsOrbit as THREE.Group
    if (marsOrbit) marsOrbit.rotation.y = time * 0.3

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
