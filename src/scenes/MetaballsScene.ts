import * as THREE from 'three'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import type { SceneModule } from '../types'

export class MetaballsScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private effect!: MarchingCubes

  // ─── init ────────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = null

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 3.5)
    this.camera.lookAt(0, 0, 0)

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffffff, 2.0)
    sun.position.set(5, 10, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    this.scene.add(sun)

    const bluePoint = new THREE.PointLight(0x4488ff, 3, 20)
    bluePoint.position.set(-3, 2, 3)
    this.scene.add(bluePoint)

    const orangePoint = new THREE.PointLight(0xffaa44, 3, 20)
    orangePoint.position.set(3, -2, -3)
    this.scene.add(orangePoint)

    // Material — metallic iridescent look
    const material = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      roughness: 0.1,
      metalness: 0.8,
      envMapIntensity: 1.0,
    })

    // MarchingCubes effect
    // Resolution 28, maxPolyCount 100000
    this.effect = new MarchingCubes(28, material, true, true, 100000)
    this.effect.position.set(-1.25, -1.25, -1.25)
    this.effect.scale.set(2.5, 2.5, 2.5)
    this.effect.enableUvs = false
    this.effect.enableColors = false

    this.scene.add(this.effect)
  }

  // ─── update ──────────────────────────────────────────────────────────────────

  update(time: number): void {
    const t = time

    // Reset metaballs for this frame
    this.effect.reset()

    // Ball 0
    const x0 = 0.5 + 0.3 * Math.sin(t * 0.7)
    const y0 = 0.5 + 0.3 * Math.cos(t * 0.5)
    const z0 = 0.5
    this.effect.addBall(x0, y0, z0, 0.5, 12)

    // Ball 1
    const x1 = 0.5 + 0.2 * Math.cos(t * 1.1)
    const y1 = 0.5
    const z1 = 0.5 + 0.2 * Math.sin(t * 0.9)
    this.effect.addBall(x1, y1, z1, 0.5, 12)

    // Ball 2
    const x2 = 0.5
    const y2 = 0.5 + 0.25 * Math.sin(t * 0.8)
    const z2 = 0.5 + 0.25 * Math.cos(t * 1.2)
    this.effect.addBall(x2, y2, z2, 0.5, 12)

    // Ball 3
    const x3 = 0.5 + 0.15 * Math.sin(t * 1.5 + 1)
    const y3 = 0.5 + 0.15 * Math.cos(t * 1.3 + 2)
    const z3 = 0.5 + 0.15 * Math.sin(t * 0.6 + 3)
    this.effect.addBall(x3, y3, z3, 0.4, 12)

    // Ball 4
    const x4 = 0.5 + 0.2 * Math.cos(t * 0.4 + 1)
    const y4 = 0.5 + 0.15 * Math.sin(t * 1.8)
    const z4 = 0.5 + 0.2 * Math.cos(t * 1.1 + 2)
    this.effect.addBall(x4, y4, z4, 0.4, 12)

    // Ball 5
    const x5 = 0.5 + 0.1 * Math.sin(t * 2.1)
    const y5 = 0.5 + 0.2 * Math.cos(t * 0.7 + 1)
    const z5 = 0.5 + 0.1 * Math.sin(t * 1.4 + 3)
    this.effect.addBall(x5, y5, z5, 0.35, 12)

    // Slow rotation
    this.effect.rotation.y = time * 0.2

    this.renderer.render(this.scene, this.camera)
  }

  // ─── SceneModule interface ────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.effect.geometry.dispose()
    ;(this.effect.material as THREE.Material).dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
