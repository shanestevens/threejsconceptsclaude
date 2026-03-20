import * as THREE from 'three'
import type { SceneModule } from '../types'

export class MorphTargetsScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 5)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dir = new THREE.DirectionalLight(0xffffff, 3.0)
    dir.position.set(5, 5, 5)
    this.scene.add(dir)
    const rim = new THREE.DirectionalLight(0x8866ff, 1.5)
    rim.position.set(-5, -2, -3)
    this.scene.add(rim)

    const colors = [0xf59e0b, 0xec4899, 0x06b6d4]
    const xPos = [-2.2, 0, 2.2]
    const phaseOffset = [0, Math.PI * 0.66, Math.PI * 1.33]

    colors.forEach((color, idx) => {
      const geo = new THREE.SphereGeometry(0.8, 64, 64)
      const base = geo.attributes.position

      // Build a spiked morph target
      const morphPos = new Float32Array(base.count * 3)
      for (let i = 0; i < base.count; i++) {
        const x = base.getX(i)
        const y = base.getY(i)
        const z = base.getZ(i)
        // Spike factor based on angular position
        const spike = Math.abs(Math.sin(y * 5 + idx) * Math.cos(x * 4 + idx))
        const scale = 1 + spike * 0.9
        morphPos[i * 3]     = x * scale
        morphPos[i * 3 + 1] = y * scale
        morphPos[i * 3 + 2] = z * scale
      }
      geo.morphAttributes.position = [new THREE.Float32BufferAttribute(morphPos, 3)]

      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = xPos[idx]
      mesh.userData.phase = phaseOffset[idx]
      this.scene.add(mesh)
      this.meshes.push(mesh)
    })
  }

  update(time: number): void {
    this.meshes.forEach((mesh) => {
      const phase = mesh.userData.phase as number
      // Oscillate influence between 0 and 1
      mesh.morphTargetInfluences![0] = Math.sin(time * 0.9 + phase) * 0.5 + 0.5
      mesh.rotation.y = time * 0.3 + phase
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
