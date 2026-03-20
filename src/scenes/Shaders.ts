import * as THREE from 'three'
import type { SceneModule } from '../types'

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float elevation = sin(pos.x * 3.0 + uTime) * 0.18
                    + sin(pos.y * 4.0 + uTime * 1.3) * 0.12
                    + sin(pos.z * 2.5 + uTime * 0.9) * 0.14;
    pos += normal * elevation;
    vElevation = elevation;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// Canonical IQ cosine palette — full spectrum, vivid
const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;

  vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 0.5);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    float t = vUv.x * 0.7 + vUv.y * 0.3 + vElevation * 2.5 + uTime * 0.25;
    vec3 col = palette(t);
    // Boost brightness so colours are vivid
    col = pow(col, vec3(0.7));
    gl_FragColor = vec4(col, 1.0);
  }
`

export class ShadersScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private mesh!: THREE.Mesh
  private uniforms!: { uTime: { value: number } }

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.z = 3

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.uniforms = { uTime: { value: 0 } }

    const geo = new THREE.SphereGeometry(1.2, 128, 128)
    const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms })
    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)
  }

  update(time: number): void {
    this.uniforms.uTime.value = time
    this.mesh.rotation.y = time * 0.15
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
