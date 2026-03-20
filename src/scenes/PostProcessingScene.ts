import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { SceneModule } from '../types'

export class PostProcessingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private composer!: EffectComposer
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x050508)

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 6)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2))

    // Bright emissive objects — these are what bloom
    const configs = [
      { geo: new THREE.TorusKnotGeometry(0.7, 0.22, 128, 16), color: 0xff6030, x: -1.8, emissive: 0xff2000 },
      { geo: new THREE.SphereGeometry(0.6, 32, 32), color: 0x30aaff, x: 0, emissive: 0x0066ff },
      { geo: new THREE.OctahedronGeometry(0.7), color: 0x60ff90, x: 1.8, emissive: 0x00ff44 },
    ]

    configs.forEach(({ geo, color, x, emissive }) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 2.0,
        roughness: 0.3,
        metalness: 0.5,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = x
      this.scene.add(mesh)
      this.meshes.push(mesh)
    })

    // Small point lights with matching emissive colours
    configs.forEach(({ emissive, x }) => {
      const l = new THREE.PointLight(emissive, 4, 6)
      l.position.set(x, 0, 1)
      this.scene.add(l)
    })

    // EffectComposer chain
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.4,   // strength
      0.6,   // radius
      0.3    // threshold — everything brighter than 0.3 blooms
    )
    this.composer.addPass(bloom)
    this.composer.addPass(new OutputPass())
  }

  update(time: number): void {
    this.meshes.forEach((m, i) => {
      m.rotation.x = time * (0.3 + i * 0.1)
      m.rotation.y = time * (0.4 + i * 0.07)
    })
    this.composer.render()
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height)
  }

  destroy(): void {
    this.composer.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
