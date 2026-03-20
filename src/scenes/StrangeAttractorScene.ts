import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const TEX = 512  // 512×512 = 262 144 particles

// ── Attractor definitions ─────────────────────────────────────────────────────
interface AttractorDef {
  type: number
  scale: number
  dt: number
}

const ATTRACTORS: AttractorDef[] = [
  { type: 0, scale: 0.045, dt: 0.005  },  // Lorenz
  { type: 1, scale: 0.16,  dt: 0.012  },  // Halvorsen
  { type: 2, scale: 0.55,  dt: 0.06   },  // Thomas
]

const CYCLE_SECONDS = 12
const WARMUP_STEPS  = 30

// ── Shaders ───────────────────────────────────────────────────────────────────

// Quad vertex shader — Three.js provides `uv` for PlaneGeometry
const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

// Simulation fragment — RK4 integration of chaotic ODEs
const SIM_FRAG = /* glsl */`
precision highp float;

uniform sampler2D uState;
uniform int       uType;
uniform float     uDt;

varying vec2 vUv;

// Lorenz: dx/dt = σ(y-x), dy/dt = x(ρ-z)-y, dz/dt = xy - βz
// σ=10, ρ=28, β=8/3
vec3 lorenz(vec3 p) {
  float sigma = 10.0;
  float rho   = 28.0;
  float beta  = 8.0 / 3.0;
  return vec3(
    sigma * (p.y - p.x),
    p.x * (rho - p.z) - p.y,
    p.x * p.y - beta * p.z
  );
}

// Halvorsen: dx/dt = -a*x - 4y - 4z - y²
//            dy/dt = -a*y - 4z - 4x - z²
//            dz/dt = -a*z - 4x - 4y - x²
// a=1.4
vec3 halvorsen(vec3 p) {
  float a = 1.4;
  return vec3(
    -a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
    -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
    -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x
  );
}

// Thomas: dx/dt = -b*x + sin(y)
//         dy/dt = -b*y + sin(z)
//         dz/dt = -b*z + sin(x)
// b=0.208186
vec3 thomas(vec3 p) {
  float b = 0.208186;
  return vec3(
    -b * p.x + sin(p.y),
    -b * p.y + sin(p.z),
    -b * p.z + sin(p.x)
  );
}

vec3 deriv(vec3 p) {
  if (uType == 0) return lorenz(p);
  if (uType == 1) return halvorsen(p);
  return thomas(p);
}

// RK4 integration
vec3 rk4(vec3 p, float dt) {
  vec3 k1 = deriv(p);
  vec3 k2 = deriv(p + k1 * (dt * 0.5));
  vec3 k3 = deriv(p + k2 * (dt * 0.5));
  vec3 k4 = deriv(p + k3 * dt);
  return p + (k1 + 2.0 * k2 + 2.0 * k3 + k4) * (dt / 6.0);
}

void main() {
  vec4  stateIn = texture2D(uState, vUv);
  vec3  pos     = stateIn.xyz;

  vec3  k1      = deriv(pos);
  float speed   = length(k1);

  vec3  newPos  = rk4(pos, uDt);

  gl_FragColor = vec4(newPos, speed);
}
`

// Render vertex — reads position texture, projects point
const RENDER_VERT = /* glsl */`
uniform sampler2D uPositions;
uniform float     uScale;

attribute vec2 aUv;

varying float vSpeed;

void main() {
  vec4  state    = texture2D(uPositions, aUv);
  vec3  pos      = state.xyz * uScale;
  vSpeed         = state.w;

  vec4  mv       = modelViewMatrix * vec4(pos, 1.0);
  gl_Position    = projectionMatrix * mv;
  gl_PointSize   = clamp(200.0 / -mv.z, 1.0, 3.0);
}
`

// Render fragment — circular discard + speed colour, additive blend
const RENDER_FRAG = /* glsl */`
varying float vSpeed;

void main() {
  vec2  d = gl_PointCoord - 0.5;
  if (length(d) > 0.5) discard;

  // slow=blue, fast=orange-yellow
  vec3 slowCol = vec3(0.05, 0.2,  1.0);
  vec3 fastCol = vec3(1.0,  0.7,  0.1);

  // normalise speed loosely (values vary per attractor; clamp is fine)
  float t   = clamp(vSpeed / 30.0, 0.0, 1.0);
  vec3  col = mix(slowCol, fastCol, t);

  gl_FragColor = vec4(col, 0.6);
}
`

// ── Scene class ───────────────────────────────────────────────────────────────
export class StrangeAttractorScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  // GPGPU
  private simScene!: THREE.Scene
  private simCam!:   THREE.OrthographicCamera
  private simMesh!:  THREE.Mesh
  private simMat!:   THREE.ShaderMaterial
  private rts!:      [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private readIdx    = 0

  // Display
  private points!:     THREE.Points
  private renderMat!:  THREE.ShaderMaterial

  // State
  private attractorIdx    = 0
  private cycleTimer      = 0
  private justLoaded      = false

  // ── init ────────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Scene + camera
    this.scene  = new THREE.Scene()
    this.scene.background = new THREE.Color(0x020408)

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 100)
    this.camera.position.set(0, 0, 4)

    // ── Render targets ───────────────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType,
    }
    this.rts = [
      new THREE.WebGLRenderTarget(TEX, TEX, rtOpts),
      new THREE.WebGLRenderTarget(TEX, TEX, rtOpts),
    ]

    // ── Sim scene (full-screen quad) ─────────────────────────────────────────
    this.simScene = new THREE.Scene()
    this.simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const quadGeo = new THREE.PlaneGeometry(2, 2)

    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uState: { value: null },
        uType:  { value: 0 },
        uDt:    { value: 0.005 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: SIM_FRAG,
    })

    this.simMesh = new THREE.Mesh(quadGeo, this.simMat)
    this.simScene.add(this.simMesh)

    // ── Display geometry ─────────────────────────────────────────────────────
    const count   = TEX * TEX
    const uvArr   = new Float32Array(count * 2)
    const dummyP  = new Float32Array(count * 3)  // zeros

    for (let row = 0; row < TEX; row++) {
      for (let col = 0; col < TEX; col++) {
        const i = row * TEX + col
        uvArr[i * 2]     = (col + 0.5) / TEX
        uvArr[i * 2 + 1] = (row + 0.5) / TEX
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(dummyP, 3))
    geo.setAttribute('aUv',      new THREE.BufferAttribute(uvArr,  2))

    this.renderMat = new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uScale:     { value: ATTRACTORS[0].scale },
      },
      vertexShader:   RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    })

    this.points = new THREE.Points(geo, this.renderMat)
    this.scene.add(this.points)

    // ── Seed first attractor ─────────────────────────────────────────────────
    this._loadAttractor(0)
  }

  // ── Load / seed attractor ────────────────────────────────────────────────────

  private _loadAttractor(idx: number): void {
    this.attractorIdx = idx
    const def = ATTRACTORS[idx]

    // Build seed DataTexture — particles spread near origin with small jitter
    const data = new Float32Array(TEX * TEX * 4)
    for (let i = 0; i < TEX * TEX; i++) {
      // Tiny random spread around attractor basin
      data[i * 4]     = (Math.random() - 0.5) * 0.1
      data[i * 4 + 1] = (Math.random() - 0.5) * 0.1
      data[i * 4 + 2] = (Math.random() - 0.5) * 0.1
      data[i * 4 + 3] = 0.0
    }

    const seedTex = new THREE.DataTexture(data, TEX, TEX, THREE.RGBAFormat, THREE.FloatType)
    seedTex.needsUpdate = true

    // Write seed into rts[0]
    this.simMat.uniforms.uType.value  = def.type
    this.simMat.uniforms.uDt.value    = def.dt
    this.simMat.uniforms.uState.value = seedTex

    this.renderer.setRenderTarget(this.rts[0])
    this.renderer.render(this.simScene, this.simCam)

    // Warmup ping-pong
    for (let s = 0; s < WARMUP_STEPS; s++) {
      const src = s % 2 === 0 ? this.rts[0] : this.rts[1]
      const dst = s % 2 === 0 ? this.rts[1] : this.rts[0]
      this.simMat.uniforms.uState.value = src.texture
      this.renderer.setRenderTarget(dst)
      this.renderer.render(this.simScene, this.simCam)
    }

    // After WARMUP_STEPS steps the last written target index:
    // step 0 writes rts[1], step 1 writes rts[0], ...
    // last written = rts[WARMUP_STEPS % 2]
    this.readIdx = WARMUP_STEPS % 2

    this.renderMat.uniforms.uScale.value = def.scale
    this.cycleTimer = 0
    this.justLoaded = true
  }

  // ── SceneModule interface ────────────────────────────────────────────────────

  update(time: number): void {
    // Return early if _loadAttractor was just called this frame (already rendered via warmup)
    if (this.justLoaded) {
      this.justLoaded = false
      // Still display current state
      this.renderMat.uniforms.uPositions.value = this.rts[this.readIdx].texture
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.scene, this.camera)
      return
    }

    const def = ATTRACTORS[this.attractorIdx]

    // ── Simulation step ───────────────────────────────────────────────────────
    const writeIdx = 1 - this.readIdx
    this.simMat.uniforms.uState.value = this.rts[this.readIdx].texture
    this.simMat.uniforms.uType.value  = def.type
    this.simMat.uniforms.uDt.value    = def.dt

    this.renderer.setRenderTarget(this.rts[writeIdx])
    this.renderer.render(this.simScene, this.simCam)

    this.readIdx = writeIdx

    // ── Rotation ──────────────────────────────────────────────────────────────
    this.points.rotation.y = time * 0.12
    this.points.rotation.x = Math.sin(time * 0.07) * 0.25

    // ── Display ───────────────────────────────────────────────────────────────
    this.renderMat.uniforms.uPositions.value = this.rts[this.readIdx].texture
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)

    // ── Auto-cycle ────────────────────────────────────────────────────────────
    // Approximate dt from fixed 60fps assumption; time is elapsed seconds
    this.cycleTimer += 1 / 60
    if (this.cycleTimer >= CYCLE_SECONDS) {
      const nextIdx = (this.attractorIdx + 1) % ATTRACTORS.length
      this._loadAttractor(nextIdx)
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.rts[0].dispose()
    this.rts[1].dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
