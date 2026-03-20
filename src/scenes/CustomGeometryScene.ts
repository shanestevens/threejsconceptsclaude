import * as THREE from 'three'
import type { SceneModule } from '../types'

export class CustomGeometryScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private mesh!: THREE.Mesh
  private posAttr!: THREE.BufferAttribute
  private readonly RES = 80

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()
    const RES = this.RES

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(3, 4, 6)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0x8899cc, 1.0))
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.5)
    sun.position.set(4, 6, 3)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0x4466ff, 1.0)
    fill.position.set(-4, -2, -4)
    this.scene.add(fill)

    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(RES * RES * 3)
    const uvs = new Float32Array(RES * RES * 2)
    const indices: number[] = []

    for (let zi = 0; zi < RES; zi++) {
      for (let xi = 0; xi < RES; xi++) {
        const i = zi * RES + xi
        const x = (xi / (RES - 1) - 0.5) * 6
        const z = (zi / (RES - 1) - 0.5) * 6
        positions[i * 3]     = x
        positions[i * 3 + 1] = 0 // will be updated each frame
        positions[i * 3 + 2] = z
        uvs[i * 2]     = xi / (RES - 1)
        uvs[i * 2 + 1] = zi / (RES - 1)

        if (xi < RES - 1 && zi < RES - 1) {
          const v = zi * RES + xi
          indices.push(v, v + 1, v + RES, v + 1, v + RES + 1, v + RES)
        }
      }
    }

    this.posAttr = new THREE.BufferAttribute(positions, 3)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)

    geo.setAttribute('position', this.posAttr)
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    // Vertex-colored material — hue based on height
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: false,
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })

    // Use a colour gradient based on y-height via onBeforeCompile
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `// Height-based colour blend from teal to orange
        float h = clamp(vViewPosition.y * 0.4 + 0.5, 0.0, 1.0);
        vec3 lowCol  = vec3(0.05, 0.55, 0.75);
        vec3 highCol = vec3(0.95, 0.55, 0.10);
        vec4 diffuseColor = vec4(mix(lowCol, highCol, h), opacity);`
      )
    }

    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)

    // Wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.05,
    })
    this.scene.add(new THREE.Mesh(geo, wireMat))
  }

  update(time: number): void {
    const RES = this.RES
    const arr = this.posAttr.array as Float32Array

    for (let zi = 0; zi < RES; zi++) {
      for (let xi = 0; xi < RES; xi++) {
        const i = zi * RES + xi
        const x = arr[i * 3]
        const z = arr[i * 3 + 2]
        // FBM-like layered sin waves
        arr[i * 3 + 1] =
          Math.sin(x * 0.9 + time * 0.6) * Math.cos(z * 0.8 + time * 0.5) * 0.5 +
          Math.sin(x * 1.8 + time * 0.9) * 0.2 +
          Math.cos(z * 1.5 + time * 0.4) * 0.2
      }
    }

    this.posAttr.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
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
