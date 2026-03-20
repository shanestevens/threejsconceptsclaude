import * as THREE from 'three'
import type { SceneModule } from '../types'

export class CurvesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private travellers: THREE.Mesh[] = []
  private curve!: THREE.CatmullRomCurve3

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 3, 7)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)

    // Closed Catmull-Rom spline — 3D loop
    this.curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-2.5,  0,    0),
        new THREE.Vector3(-1.5,  1.8, -1.5),
        new THREE.Vector3( 0,    0.5,  2.5),
        new THREE.Vector3( 1.5,  1.8, -1.5),
        new THREE.Vector3( 2.5,  0,    0),
        new THREE.Vector3( 1.5, -1.8,  1.5),
        new THREE.Vector3( 0,   -0.5, -2.5),
        new THREE.Vector3(-1.5, -1.8,  1.5),
      ],
      true  // closed
    )

    // Tube geometry traces the path
    const tubeGeo = new THREE.TubeGeometry(this.curve, 200, 0.045, 8, true)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.5,
    })
    this.scene.add(new THREE.Mesh(tubeGeo, tubeMat))

    // Glowing spheres that travel along the curve, evenly spaced
    const count = 24
    for (let i = 0; i < count; i++) {
      const hue = i / count
      const color = new THREE.Color().setHSL(hue, 0.95, 0.65)
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.7,
        roughness: 0.2,
        metalness: 0.1,
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), mat)
      this.scene.add(mesh)
      this.travellers.push(mesh)
    }

    // Control point markers
    this.curve.points.forEach((pt) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      )
      marker.position.copy(pt)
      this.scene.add(marker)
    })
  }

  update(time: number): void {
    const count = this.travellers.length
    this.travellers.forEach((sphere, i) => {
      const t = ((time * 0.12 + i / count) % 1 + 1) % 1
      const pos = this.curve.getPoint(t)
      sphere.position.copy(pos)
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
