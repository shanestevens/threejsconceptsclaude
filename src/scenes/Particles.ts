import * as THREE from 'three'
import type { SceneModule } from '../types'

export class ParticlesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private particles!: THREE.Points
  private velocities!: Float32Array

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.z = 5

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const count = 4000
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)

    // Full-spectrum vivid palette
    const palette = [
      new THREE.Color(0xef4444),
      new THREE.Color(0xf97316),
      new THREE.Color(0xeab308),
      new THREE.Color(0x22c55e),
      new THREE.Color(0x06b6d4),
      new THREE.Color(0x6366f1),
      new THREE.Color(0xa855f7),
      new THREE.Color(0xec4899),
    ]

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.8 + Math.random() * 1.8

      positions[i3]     = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi)

      this.velocities[i3]     = (Math.random() - 0.5) * 0.003
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.003
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.003

      const c = palette[Math.floor(Math.random() * palette.length)]
      colors[i3]     = c.r
      colors[i3 + 1] = c.g
      colors[i3 + 2] = c.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    })

    this.particles = new THREE.Points(geo, mat)
    this.scene.add(this.particles)
  }

  update(time: number): void {
    this.particles.rotation.y = time * 0.08
    this.particles.rotation.x = time * 0.03

    const positions = this.particles.geometry.attributes.position.array as Float32Array
    const count = positions.length / 3

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3]     += this.velocities[i3]
      positions[i3 + 1] += this.velocities[i3 + 1]
      positions[i3 + 2] += this.velocities[i3 + 2]

      const dist = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2)
      if (dist > 4 || dist < 1.4) {
        this.velocities[i3]     *= -1
        this.velocities[i3 + 1] *= -1
        this.velocities[i3 + 2] *= -1
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true
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
