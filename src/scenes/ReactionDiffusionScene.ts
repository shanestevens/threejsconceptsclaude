import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const SIM_SIZE    = 256   // texture resolution
const STEPS       = 12   // simulation steps per update() call

// Gray-Scott parameters — coral / spots preset
const DA = 0.2097
const DB = 0.1050
const F  = 0.055
const K  = 0.062

// ── Shaders ───────────────────────────────────────────────────────────────────
const QUAD_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`

// Gray-Scott reaction-diffusion step
const SIM_FRAG = /* glsl */`
uniform sampler2D uAB;     // R = A, G = B
uniform vec2      uTexel;  // 1.0 / SIM_SIZE

const float Da = ${DA};
const float Db = ${DB};
const float f  = ${F};
const float k  = ${K};
const float dt = 1.0;

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;

  // Wrap-around neighbours
  vec2 l = mod(gl_FragCoord.xy + vec2(-1.0,  0.0), ${SIM_SIZE}.0) * uTexel;
  vec2 r = mod(gl_FragCoord.xy + vec2( 1.0,  0.0), ${SIM_SIZE}.0) * uTexel;
  vec2 u = mod(gl_FragCoord.xy + vec2( 0.0,  1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 d = mod(gl_FragCoord.xy + vec2( 0.0, -1.0), ${SIM_SIZE}.0) * uTexel;

  vec2 centre = texture2D(uAB, uv).rg;
  vec2 lapSum = texture2D(uAB, l).rg
              + texture2D(uAB, r).rg
              + texture2D(uAB, u).rg
              + texture2D(uAB, d).rg;

  // 5-point Laplacian
  vec2 lap = lapSum - 4.0 * centre;

  float A = centre.r;
  float B = centre.g;

  float reaction = A * B * B;

  float newA = clamp(A + dt * (Da * lap.r - reaction + f * (1.0 - A)), 0.0, 1.0);
  float newB = clamp(B + dt * (Db * lap.g + reaction - (k + f) * B),   0.0, 1.0);

  gl_FragColor = vec4(newA, newB, 0.0, 1.0);
}
`

// Display — map B concentration to cosine palette
const DISPLAY_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const DISPLAY_FRAG = /* glsl */`
uniform sampler2D uAB;
varying vec2 vUv;

void main() {
  float B = texture2D(uAB, vUv).g;
  // Cosine palette: dark blue (B=0) → cyan → yellow → white (B=1)
  vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.15, 0.25) + B * 0.8));
  gl_FragColor = vec4(col, 1.0);
}
`

// ── Scene class ───────────────────────────────────────────────────────────────
export class ReactionDiffusionScene implements SceneModule {
  private renderer!:    THREE.WebGLRenderer
  private scene!:       THREE.Scene
  private camera!:      THREE.PerspectiveCamera

  // GPGPU ping-pong
  private simScene!:    THREE.Scene
  private simCam!:      THREE.OrthographicCamera
  private simMesh!:     THREE.Mesh
  private simMatA!:     THREE.ShaderMaterial  // reads rtA, writes rtB
  private simMatB!:     THREE.ShaderMaterial  // reads rtB, writes rtA
  private rtA!:         THREE.WebGLRenderTarget
  private rtB!:         THREE.WebGLRenderTarget
  private readIsA       = true   // which RT is the current read source

  // Display
  private displayMat!:  THREE.ShaderMaterial

  // ── init ──────────────────────────────────────────────────────────────────
  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)

    // ── Display camera & scene ────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 3.5)
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()

    // ── Render targets ────────────────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType,
    }
    this.rtA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts)
    this.rtB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts)

    // ── Seed DataTexture ──────────────────────────────────────────────────────
    const data = new Float32Array(SIM_SIZE * SIM_SIZE * 4)

    // Default: A=1, B=0 everywhere
    for (let i = 0; i < SIM_SIZE * SIM_SIZE; i++) {
      data[i * 4]     = 1.0  // A
      data[i * 4 + 1] = 0.0  // B
      data[i * 4 + 2] = 0.0
      data[i * 4 + 3] = 1.0
    }

    // Helper: fill a square region with B=1
    const fillSquare = (cx: number, cy: number, half: number) => {
      for (let y = cy - half; y <= cy + half; y++) {
        for (let x = cx - half; x <= cx + half; x++) {
          const px = ((x % SIM_SIZE) + SIM_SIZE) % SIM_SIZE
          const py = ((y % SIM_SIZE) + SIM_SIZE) % SIM_SIZE
          const idx = (py * SIM_SIZE + px) * 4
          data[idx + 1] = 1.0  // B = 1
        }
      }
    }

    const mid  = Math.floor(SIM_SIZE / 2)
    const qtr  = Math.floor(SIM_SIZE / 4)

    // Central 12×12 seed (half-radius = 6)
    fillSquare(mid, mid, 6)

    // Four smaller 5×5 seeds at quadrant midpoints (half-radius = 2)
    fillSquare(qtr,       qtr,       2)
    fillSquare(mid + qtr, qtr,       2)
    fillSquare(qtr,       mid + qtr, 2)
    fillSquare(mid + qtr, mid + qtr, 2)

    const seedTex = new THREE.DataTexture(data, SIM_SIZE, SIM_SIZE, THREE.RGBAFormat, THREE.FloatType)
    seedTex.needsUpdate = true

    // Copy seed into rtA via an initial render pass
    const texel = new THREE.Vector2(1.0 / SIM_SIZE, 1.0 / SIM_SIZE)

    // ── Simulation materials (one per ping-pong direction) ────────────────────
    this.simMatA = new THREE.ShaderMaterial({
      uniforms: {
        uAB:    { value: seedTex },
        uTexel: { value: texel },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: SIM_FRAG,
    })

    this.simMatB = new THREE.ShaderMaterial({
      uniforms: {
        uAB:    { value: this.rtA.texture },
        uTexel: { value: texel },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: SIM_FRAG,
    })

    // ── Sim scene (full-screen quad) ──────────────────────────────────────────
    this.simScene = new THREE.Scene()
    this.simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad    = new THREE.PlaneGeometry(2, 2)
    this.simMesh  = new THREE.Mesh(quad, this.simMatA)
    this.simScene.add(this.simMesh)

    // Prime rtA with the seed texture (one pass before display starts)
    this.simMesh.material = this.simMatA
    this.simMatA.uniforms.uAB.value = seedTex
    this.renderer.setRenderTarget(this.rtA)
    this.renderer.render(this.simScene, this.simCam)
    this.renderer.setRenderTarget(null)
    this.readIsA = true

    // ── Display plane ─────────────────────────────────────────────────────────
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: {
        uAB: { value: this.rtA.texture },
      },
      vertexShader:   DISPLAY_VERT,
      fragmentShader: DISPLAY_FRAG,
    })

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), this.displayMat)
    this.scene.add(plane)
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(_time: number): void {
    // Run STEPS simulation passes with ping-pong
    for (let s = 0; s < STEPS; s++) {
      if (this.readIsA) {
        // Read from rtA, write to rtB
        this.simMesh.material = this.simMatB
        this.simMatB.uniforms.uAB.value = this.rtA.texture
        this.renderer.setRenderTarget(this.rtB)
        this.renderer.render(this.simScene, this.simCam)
        this.readIsA = false
      } else {
        // Read from rtB, write to rtA
        this.simMesh.material = this.simMatA
        this.simMatA.uniforms.uAB.value = this.rtB.texture
        this.renderer.setRenderTarget(this.rtA)
        this.renderer.render(this.simScene, this.simCam)
        this.readIsA = true
      }
    }

    // Point display at current read target
    this.displayMat.uniforms.uAB.value = this.readIsA
      ? this.rtA.texture
      : this.rtB.texture

    // Render display scene
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  // ── resize ────────────────────────────────────────────────────────────────
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  // ── destroy ───────────────────────────────────────────────────────────────
  destroy(): void {
    this.rtA.dispose()
    this.rtB.dispose()
    this.simMatA.dispose()
    this.simMatB.dispose()
    this.displayMat.dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
