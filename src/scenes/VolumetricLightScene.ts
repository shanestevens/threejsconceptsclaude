import * as THREE from 'three'
import type { SceneModule } from '../types'

const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position,1.0); }`

const GOD_RAYS_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2      uLightPos;   // light screen-space [0..1]
uniform float     uTime;
varying vec2 vUv;

const int SAMPLES = 100;

void main() {
  vec2  tc    = vUv;
  vec2  delta = (tc - uLightPos) / float(SAMPLES);
  float illum = 0.0;
  float decay = 1.0;

  for (int i = 0; i < SAMPLES; i++) {
    tc -= delta;
    if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) break;
    float lum  = dot(texture2D(tScene, tc).rgb, vec3(0.30, 0.59, 0.11));
    illum     += lum * decay;
    decay     *= 0.965;
  }
  illum *= 0.022;

  vec3  scene  = texture2D(tScene, vUv).rgb;
  float pulse  = 0.92 + 0.08 * sin(uTime * 0.6);
  // Warm amber shafts
  vec3  rays   = illum * vec3(1.0, 0.78, 0.35) * pulse;

  gl_FragColor = vec4(scene + rays, 1.0);
}
`

// Thin vertical mist strips scrolling upward — adds atmosphere behind the pillars
const MIST_VERT = /* glsl */ `
uniform float uTime;
attribute float aOffset;
attribute float aSpeed;
varying float vAlpha;

void main() {
  vec3 p = position;
  p.y += mod(uTime * aSpeed + aOffset * 8.0, 9.0) - 1.0;
  vAlpha = smoothstep(0.0, 1.5, p.y) * smoothstep(9.0, 6.0, p.y) * 0.18;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 3.0;
}
`
const MIST_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  gl_FragColor = vec4(1.0, 0.9, 0.6, vAlpha * smoothstep(0.5, 0.1, r));
}
`

export class VolumetricLightScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private mainScene!: THREE.Scene
  private postScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private postCamera!: THREE.OrthographicCamera
  private rt!: THREE.WebGLRenderTarget
  private postUniforms!: Record<string, { value: unknown }>
  private sunMesh!: THREE.Mesh
  private mistMat!: THREE.ShaderMaterial

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.mainScene = new THREE.Scene()
    this.mainScene.background = new THREE.Color(0x06060e)
    this.postScene = new THREE.Scene()

    // Camera looks slightly upward so pillars are framed against the sky-sun
    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 60)
    this.camera.position.set(0, 0.8, 5)
    this.camera.lookAt(0, 2.5, 0)

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    this.rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // ── Sun: large bright sphere at top-center ─────────────────────────────
    // Use TWO spheres: a solid core + a soft halo so it reads as glowing
    const sunPos = new THREE.Vector3(0.3, 7.5, -6)

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfffce8 })
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), coreMat)
    this.sunMesh.position.copy(sunPos)
    this.mainScene.add(this.sunMesh)

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfff5c0, transparent: true, opacity: 0.25, side: THREE.FrontSide,
    })
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 16), haloMat)
    halo.position.copy(sunPos)
    this.mainScene.add(halo)

    // Point light radiating from sun
    const sunLight = new THREE.PointLight(0xffe8a0, 10, 30)
    sunLight.position.copy(sunPos)
    this.mainScene.add(sunLight)

    this.mainScene.add(new THREE.AmbientLight(0x1a1028, 1.0))

    // Faint fill from below so pillars aren't pitch-black
    const fillLight = new THREE.DirectionalLight(0x1a0a30, 0.8)
    fillLight.position.set(0, -1, 3)
    this.mainScene.add(fillLight)

    // ── Ground ─────────────────────────────────────────────────────────────
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0814, roughness: 1.0 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.5
    this.mainScene.add(ground)

    // ── Tree trunks — dark silhouettes spread across the view ──────────────
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 1.0 })

    // Deterministic layout: x spread from -4 to 4, depth variation
    const trunkData = [
      { x: -3.8, z: -0.5, r: 0.18, h: 9.5 },
      { x: -2.5, z:  0.4, r: 0.14, h: 8.0 },
      { x: -1.4, z: -1.2, r: 0.20, h: 9.0 },
      { x: -0.4, z:  0.8, r: 0.13, h: 7.5 },
      { x:  0.6, z: -0.6, r: 0.17, h: 9.2 },
      { x:  1.6, z:  1.2, r: 0.12, h: 8.5 },
      { x:  2.7, z: -0.3, r: 0.19, h: 9.0 },
      { x:  3.9, z:  0.7, r: 0.15, h: 8.0 },
      // extra depth layer — partially visible between foreground trunks
      { x: -2.0, z: -2.5, r: 0.11, h: 9.5 },
      { x:  0.0, z: -2.0, r: 0.13, h: 9.5 },
      { x:  2.2, z: -2.8, r: 0.10, h: 9.5 },
    ]

    for (const { x, z, r, h } of trunkData) {
      const geo = new THREE.CylinderGeometry(r * 0.85, r, h, 7)
      const mesh = new THREE.Mesh(geo, trunkMat)
      mesh.position.set(x, h / 2 - 0.5, z)
      this.mainScene.add(mesh)
    }

    // Canopy: horizontal dark blobs at varying heights to add variety
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x04040c, roughness: 1.0 })
    const canopyData = [
      { x: -3.8, y: 5.5, z: -0.5, rx: 1.2, ry: 0.35, rz: 0.9 },
      { x: -1.4, y: 6.5, z: -1.2, rx: 1.0, ry: 0.3, rz: 1.1 },
      { x:  0.6, y: 5.8, z: -0.6, rx: 0.9, ry: 0.32, rz: 0.85 },
      { x:  2.7, y: 6.2, z: -0.3, rx: 1.1, ry: 0.28, rz: 0.95 },
    ]
    for (const { x, y, z, rx, ry, rz } of canopyData) {
      const geo = new THREE.SphereGeometry(1, 7, 5)
      geo.scale(rx, ry, rz)
      const mesh = new THREE.Mesh(geo, canopyMat)
      mesh.position.set(x, y, z)
      this.mainScene.add(mesh)
    }

    // ── Floating mist particles ────────────────────────────────────────────
    const MIST_COUNT = 600
    const mistPos    = new Float32Array(MIST_COUNT * 3)
    const mistOffset = new Float32Array(MIST_COUNT)
    const mistSpeed  = new Float32Array(MIST_COUNT)

    for (let i = 0; i < MIST_COUNT; i++) {
      mistPos[i * 3]     = (Math.random() - 0.5) * 8
      mistPos[i * 3 + 1] = Math.random() * 9
      mistPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1
      mistOffset[i] = Math.random()
      mistSpeed[i]  = 0.08 + Math.random() * 0.12
    }

    const mistGeo = new THREE.BufferGeometry()
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3))
    mistGeo.setAttribute('aOffset',  new THREE.BufferAttribute(mistOffset, 1))
    mistGeo.setAttribute('aSpeed',   new THREE.BufferAttribute(mistSpeed, 1))

    this.mistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: MIST_VERT,
      fragmentShader: MIST_FRAG,
      transparent: true,
      depthWrite: false,
    })
    this.mainScene.add(new THREE.Points(mistGeo, this.mistMat))

    // ── God-rays post pass ─────────────────────────────────────────────────
    const proj = new THREE.Vector3().copy(this.sunMesh.position).project(this.camera)
    const lightUV = new THREE.Vector2(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5)

    this.postUniforms = {
      tScene:    { value: this.rt.texture },
      uLightPos: { value: lightUV },
      uTime:     { value: 0 },
    }

    const postMat = new THREE.ShaderMaterial({
      uniforms: this.postUniforms,
      vertexShader: POST_VERT,
      fragmentShader: GOD_RAYS_FRAG,
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat))
  }

  update(time: number): void {
    this.postUniforms['uTime'].value = time
    this.mistMat.uniforms['uTime'].value = time

    // Slow sun drift — stays near top-center so rays always point downward
    const sunX = 0.3 + Math.sin(time * 0.08) * 0.6
    const sunY = 7.5 + Math.sin(time * 0.06) * 0.4
    this.sunMesh.position.set(sunX, sunY, -6)

    const proj = new THREE.Vector3().copy(this.sunMesh.position).project(this.camera)
    const luv = this.postUniforms['uLightPos'].value as THREE.Vector2
    luv.set(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5)

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
