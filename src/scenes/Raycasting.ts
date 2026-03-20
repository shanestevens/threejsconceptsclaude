import * as THREE from 'three'
import type { SceneModule } from '../types'

export class RaycastingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2(-9999, -9999)
  private spheres: THREE.Mesh[] = []
  private canvas!: HTMLCanvasElement
  private onMouseMove!: (e: MouseEvent) => void
  private onMouseLeave!: () => void

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 9)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.0)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)
    const rimLight = new THREE.DirectionalLight(0xa855f7, 1.5)
    rimLight.position.set(-5, -3, -5)
    this.scene.add(rimLight)

    // 5×5 grid of spheres
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const geo = new THREE.SphereGeometry(0.38, 32, 32)
        const mat = new THREE.MeshStandardMaterial({
          color: 0xa855f7,
          roughness: 0.3,
          metalness: 0.3,
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set((col - 2) * 1.3, (row - 2) * 1.3, 0)
        this.scene.add(mesh)
        this.spheres.push(mesh)
      }
    }

    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    this.onMouseLeave = () => {
      this.mouse.set(-9999, -9999)
    }

    this.canvas.addEventListener('mousemove', this.onMouseMove)
    this.canvas.addEventListener('mouseleave', this.onMouseLeave)
  }

  update(_time: number): void {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const hits = this.raycaster.intersectObjects(this.spheres)
    const hitSet = new Set(hits.map((h) => h.object))

    this.spheres.forEach((s) => {
      const mat = s.material as THREE.MeshStandardMaterial
      if (hitSet.has(s)) {
        mat.color.setHex(0xfbbf24)
        mat.emissive.setHex(0xfbbf24)
        mat.emissiveIntensity = 0.35
        s.scale.lerp(new THREE.Vector3(1.25, 1.25, 1.25), 0.15)
      } else {
        mat.color.setHex(0xa855f7)
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
        s.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15)
      }
    })

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
