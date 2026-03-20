import * as THREE from 'three'
import type { SceneModule } from '../types'

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`

const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uTime;

varying vec2 vUv;

float readDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return (2.0 * uNear) / (uFar + uNear - z * (uFar - uNear));
}

void main() {
  vec4 col   = texture2D(tColor, vUv);
  float depth = readDepth(vUv);

  // Edge detection via depth discontinuity
  float eps = 0.003;
  float d0 = readDepth(vUv + vec2( eps,  0  ));
  float d1 = readDepth(vUv + vec2(-eps,  0  ));
  float d2 = readDepth(vUv + vec2( 0  ,  eps));
  float d3 = readDepth(vUv + vec2( 0  , -eps));

  float edge = abs(d0-d1) + abs(d2-d3);
  edge = smoothstep(0.004, 0.015, edge);

  // Depth-based tint (deeper = cooler colour)
  vec3 depthTint = mix(vec3(1.0, 0.85, 0.5), vec3(0.3, 0.5, 1.0), depth);
  col.rgb = mix(col.rgb, col.rgb * depthTint, 0.4);

  // Pulse the outline colour with time
  vec3 outlineCol = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0,0.33,0.67) + uTime * 0.15));
  col.rgb = mix(col.rgb, outlineCol, edge * 0.9);

  gl_FragColor = col;
}
`

export class DepthBufferScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private mainScene!: THREE.Scene
  private postScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private postCamera!: THREE.OrthographicCamera
  private rt!: THREE.WebGLRenderTarget
  private postUniforms!: Record<string, { value: unknown }>
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()
    const near = 0.1, far = 30

    this.mainScene = new THREE.Scene()
    this.postScene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, near, far)
    this.camera.position.set(0, 2, 7)
    this.camera.lookAt(0, 0, 0)

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Render target with depth texture
    const depthTex = new THREE.DepthTexture(width, height)
    depthTex.format = THREE.DepthFormat
    depthTex.type   = THREE.UnsignedShortType

    this.rt = new THREE.WebGLRenderTarget(width, height, {
      depthTexture: depthTex,
      depthBuffer:  true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // Main scene objects
    this.mainScene.background = new THREE.Color(0x080812)
    this.mainScene.add(new THREE.AmbientLight(0x334466, 1.0))
    const dir = new THREE.DirectionalLight(0xffffff, 3.0)
    dir.position.set(5, 5, 3)
    this.mainScene.add(dir)

    const configs = [
      { geo: new THREE.SphereGeometry(0.6, 32, 32), color: 0x6366f1, pos: [-2, 0, 0] as [number,number,number] },
      { geo: new THREE.BoxGeometry(0.9, 0.9, 0.9), color: 0xf97316, pos: [0, 0, -1] as [number,number,number] },
      { geo: new THREE.TorusGeometry(0.55, 0.2, 16, 32), color: 0xec4899, pos: [2, 0, 0] as [number,number,number] },
      { geo: new THREE.OctahedronGeometry(0.65), color: 0x22c55e, pos: [0, 0, 1] as [number,number,number] },
    ]
    configs.forEach(({ geo, color, pos }) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...pos)
      this.mainScene.add(mesh)
      this.meshes.push(mesh)
    })

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.9 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1
    this.mainScene.add(floor)

    // Post-process quad
    this.postUniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      uNear:  { value: near },
      uFar:   { value: far },
      uTime:  { value: 0 },
    }
    const postMat = new THREE.ShaderMaterial({
      uniforms: this.postUniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat))
  }

  update(time: number): void {
    this.postUniforms['uTime'].value = time
    this.meshes.forEach((m, i) => {
      m.rotation.y = time * (0.3 + i * 0.1)
      m.rotation.x = time * 0.15
    })

    this.renderer.setRenderTarget(this.rt)
    this.renderer.render(this.mainScene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.postScene, this.postCamera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.rt.setSize(width, height)
  }

  destroy(): void {
    this.rt.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
