import * as THREE from 'three'
import type { SceneModule } from '../types'

export class EnvironmentScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private objects: THREE.Mesh[] = []
  private envMap!: THREE.WebGLCubeRenderTarget
  private cubeCamera!: THREE.CubeCamera
  private chromeOrb!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    // Background must match fog/env color so cube camera has something to reflect
    this.scene.background = new THREE.Color(0x0d0d1f)

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 1.5, 5)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 2.0

    // Bright ambient so nothing is pitch black
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))

    // Strong, vivid point lights — high intensity so they show in env map reflections
    const lights: { color: number; pos: [number, number, number]; intensity: number }[] = [
      { color: 0x6366f1, pos: [3, 3, 3],    intensity: 12 },
      { color: 0xec4899, pos: [-3, 1, -2],  intensity: 10 },
      { color: 0x06b6d4, pos: [0, -2, 3],   intensity: 8  },
      { color: 0xfbbf24, pos: [0, 4, 0],    intensity: 6  },
    ]

    lights.forEach(({ color, pos, intensity }) => {
      const l = new THREE.PointLight(color, intensity, 20)
      l.position.set(...pos)
      this.scene.add(l)
      // Small sphere to show light position
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      )
      sphere.position.set(...pos)
      this.scene.add(sphere)
    })

    // Cube camera for real-time reflections — larger target = more detail
    this.envMap = new THREE.WebGLCubeRenderTarget(512, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    })
    this.cubeCamera = new THREE.CubeCamera(0.1, 50, this.envMap)
    this.scene.add(this.cubeCamera)

    // Chrome orb — metalness 1, roughness 0 = perfect mirror
    const orbGeo = new THREE.SphereGeometry(0.9, 64, 64)
    const orbMat = new THREE.MeshStandardMaterial({
      metalness: 1.0,
      roughness: 0.0,
      envMap: this.envMap.texture,
    })
    this.chromeOrb = new THREE.Mesh(orbGeo, orbMat)
    this.scene.add(this.chromeOrb)

    // Orbiting torus knots for the orb to reflect
    const geo = new THREE.TorusKnotGeometry(0.35, 0.12, 128, 16)
    const objConfigs = [
      { color: 0xf43f5e, x: -2,   y: 0,   z: -1   },
      { color: 0x22c55e, x:  2,   y: 0.5, z: -1.5 },
      { color: 0xeab308, x:  0,   y: 1.8, z: -2   },
      { color: 0xa855f7, x: -1.5, y: -1,  z:  1   },
    ]
    objConfigs.forEach(({ color, x, y, z }) => {
      const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.2 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      this.scene.add(mesh)
      this.objects.push(mesh)
    })
  }

  update(time: number): void {
    this.objects.forEach((obj, i) => {
      obj.rotation.x = time * (0.4 + i * 0.1)
      obj.rotation.y = time * (0.3 + i * 0.15)
    })

    this.chromeOrb.visible = false
    this.cubeCamera.update(this.renderer, this.scene)
    this.chromeOrb.visible = true

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.envMap.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
