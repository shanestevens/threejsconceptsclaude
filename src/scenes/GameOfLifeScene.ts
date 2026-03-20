import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const SIM_SIZE        = 512          // 512×512 grid
const STEP_INTERVAL   = 0.1          // seconds between GOL ticks (10 fps)
const ALIVE_FRACTION  = 0.30         // ~30% cells alive on init

// ── Shaders ───────────────────────────────────────────────────────────────────
/** Full-screen quad vertex shader (no projection needed) */
const QUAD_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`

/** Conway's Game of Life step fragment shader.
 *  Reads R channel: 1.0 = alive, 0.0 = dead.
 *  Outputs new state in R channel.
 */
const GOL_FRAG = /* glsl */`
uniform sampler2D uState;   // current GOL grid (R = alive)
uniform vec2      uTexel;   // 1.0 / SIM_SIZE

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;

  // Toroidal (wrap-around) 8-neighbour UVs
  vec2 l  = mod(gl_FragCoord.xy + vec2(-1.0,  0.0), ${SIM_SIZE}.0) * uTexel;
  vec2 r  = mod(gl_FragCoord.xy + vec2( 1.0,  0.0), ${SIM_SIZE}.0) * uTexel;
  vec2 u  = mod(gl_FragCoord.xy + vec2( 0.0,  1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 d  = mod(gl_FragCoord.xy + vec2( 0.0, -1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 ul = mod(gl_FragCoord.xy + vec2(-1.0,  1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 ur = mod(gl_FragCoord.xy + vec2( 1.0,  1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 dl = mod(gl_FragCoord.xy + vec2(-1.0, -1.0), ${SIM_SIZE}.0) * uTexel;
  vec2 dr = mod(gl_FragCoord.xy + vec2( 1.0, -1.0), ${SIM_SIZE}.0) * uTexel;

  float self = texture2D(uState, uv).r;

  float neighbours =
      texture2D(uState, l ).r +
      texture2D(uState, r ).r +
      texture2D(uState, u ).r +
      texture2D(uState, d ).r +
      texture2D(uState, ul).r +
      texture2D(uState, ur).r +
      texture2D(uState, dl).r +
      texture2D(uState, dr).r;

  // Conway's rules:
  //   Alive: survive with 2 or 3 neighbours
  //   Dead:  born with exactly 3 neighbours
  float alive = 0.0;
  if (self > 0.5) {
    // Currently alive — survive if 2 or 3 neighbours
    if (neighbours > 1.5 && neighbours < 3.5) alive = 1.0;
  } else {
    // Currently dead — born if exactly 3 neighbours
    if (neighbours > 2.5 && neighbours < 3.5) alive = 1.0;
  }

  gl_FragColor = vec4(alive, 0.0, 0.0, 1.0);
}
`

/** Display vertex shader — passes UV through for sampling. */
const DISPLAY_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Display fragment shader.
 * Dead cells: very dark navy (#0a0a1a).
 * Live cells: bright cyan/teal with a glow-friendly over-bright output.
 * Subtle grid lines overlay.
 */
const DISPLAY_FRAG = /* glsl */`
uniform sampler2D uState;
uniform float     uTime;
varying vec2      vUv;

void main() {
  float alive = texture2D(uState, vUv).r;

  // Dead colour
  vec3 deadCol = vec3(0.039, 0.039, 0.102);   // #0a0a1a

  // Live colour — over-bright cyan/teal so tone-mapping/bloom can kick in
  vec3 accentCol = vec3(0.0, 1.0, 0.8);        // #00ffcc
  vec3 liveCol   = accentCol * 1.5;            // over-bright for glow

  // Mix live/dead with a tiny pulse on live cells
  float pulse  = 1.0 + 0.04 * sin(uTime * 6.0);
  vec3 cellCol = mix(deadCol, liveCol * pulse, alive);

  // Subtle grid lines (very faint dark lines at cell boundaries)
  vec2  gridUv  = fract(vUv * ${SIM_SIZE}.0);
  float lineW   = 0.04;
  float gridVal = step(lineW, gridUv.x) * step(lineW, gridUv.y);
  // Only show grid where cell is dead, and very faintly
  float gridMix = (1.0 - alive) * (1.0 - gridVal) * 0.15;
  cellCol       = mix(cellCol, vec3(0.12, 0.12, 0.25), gridMix);

  gl_FragColor = vec4(cellCol, 1.0);
}
`

// ── Helper: build a randomised seed DataTexture ───────────────────────────────
function buildSeedTexture(aliveFraction: number): THREE.DataTexture {
  // Use Uint8Array — R channel: 255 = alive, 0 = dead
  const data = new Uint8Array(SIM_SIZE * SIM_SIZE * 4)
  for (let i = 0; i < SIM_SIZE * SIM_SIZE; i++) {
    const alive = Math.random() < aliveFraction ? 255 : 0
    data[i * 4]     = alive   // R
    data[i * 4 + 1] = 0       // G
    data[i * 4 + 2] = 0       // B
    data[i * 4 + 3] = 255     // A
  }
  const tex = new THREE.DataTexture(data, SIM_SIZE, SIM_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.needsUpdate = true
  return tex
}

// ── Scene class ───────────────────────────────────────────────────────────────
export class GameOfLifeScene implements SceneModule {
  // Display
  private renderer!:    THREE.WebGLRenderer
  private scene!:       THREE.Scene
  private camera!:      THREE.PerspectiveCamera
  private displayMat!:  THREE.ShaderMaterial

  // GPGPU ping-pong
  private simScene!:    THREE.Scene
  private simCam!:      THREE.OrthographicCamera
  private simMesh!:     THREE.Mesh
  private golMatA!:     THREE.ShaderMaterial   // reads rtA, writes rtB
  private golMatB!:     THREE.ShaderMaterial   // reads rtB, writes rtA
  private rtA!:         THREE.WebGLRenderTarget
  private rtB!:         THREE.WebGLRenderTarget
  private readIsA       = true

  // Timing
  private accumulator   = 0
  private lastTime      = -1

  // Click handler (stored so we can remove it)
  private clickHandler!: () => void
  private canvas!:       HTMLCanvasElement

  // ── init ──────────────────────────────────────────────────────────────────
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x06060f, 1)

    // ── Display camera ────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 8, 12)
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x06060f)

    // ── Render targets — nearest filtering keeps pixel-perfect cell edges ────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.UnsignedByteType,
    }
    this.rtA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts)
    this.rtB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts)

    // ── Texel size uniform (shared value, never mutates) ──────────────────────
    const texel = new THREE.Vector2(1.0 / SIM_SIZE, 1.0 / SIM_SIZE)

    // ── GOL simulation materials ──────────────────────────────────────────────
    this.golMatA = new THREE.ShaderMaterial({
      uniforms: {
        uState:  { value: null },
        uTexel:  { value: texel },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: GOL_FRAG,
    })

    this.golMatB = new THREE.ShaderMaterial({
      uniforms: {
        uState:  { value: null },
        uTexel:  { value: texel },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: GOL_FRAG,
    })

    // ── Sim scene (full-screen quad, no perspective) ──────────────────────────
    this.simScene = new THREE.Scene()
    this.simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad    = new THREE.PlaneGeometry(2, 2)
    this.simMesh  = new THREE.Mesh(quad, this.golMatA)
    this.simScene.add(this.simMesh)

    // ── Seed initial state into rtA ───────────────────────────────────────────
    this.seedGrid()

    // ── Display plane (10×10 units) ───────────────────────────────────────────
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: {
        uState: { value: this.rtA.texture },
        uTime:  { value: 0 },
      },
      vertexShader:   DISPLAY_VERT,
      fragmentShader: DISPLAY_FRAG,
    })

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      this.displayMat,
    )
    // Tilt the plane slightly so the isometric-ish camera reads naturally
    plane.rotation.x = -Math.PI / 2
    this.scene.add(plane)

    // ── Click to randomise ────────────────────────────────────────────────────
    this.clickHandler = () => { this.seedGrid() }
    canvas.addEventListener('click', this.clickHandler)
  }

  // ── seedGrid ──────────────────────────────────────────────────────────────
  /** Randomise the grid and prime rtA with the new state. */
  private seedGrid(): void {
    const seedTex = buildSeedTexture(ALIVE_FRACTION)

    // Upload seed → rtA via one sim pass
    this.golMatA.uniforms.uState.value = seedTex
    this.simMesh.material = this.golMatA
    this.renderer.setRenderTarget(this.rtA)
    this.renderer.render(this.simScene, this.simCam)
    this.renderer.setRenderTarget(null)

    seedTex.dispose()
    this.readIsA    = true
    this.accumulator = 0
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(time: number): void {
    // Delta time, clamped to avoid spiral of death on tab-switch
    const delta = this.lastTime < 0 ? 0 : Math.min(time - this.lastTime, 0.1)
    this.lastTime = time

    this.accumulator += delta

    // Run GOL ticks at STEP_INTERVAL cadence (not every frame)
    while (this.accumulator >= STEP_INTERVAL) {
      this.stepGOL()
      this.accumulator -= STEP_INTERVAL
    }

    // Point display at the current read target
    this.displayMat.uniforms.uState.value = this.readIsA
      ? this.rtA.texture
      : this.rtB.texture
    this.displayMat.uniforms.uTime.value = time

    // Slowly orbit the camera for visual interest
    const angle  = time * 0.08
    const radius = 14
    const height =  8 + Math.sin(time * 0.05) * 1.5
    this.camera.position.set(
      Math.sin(angle) * radius,
      height,
      Math.cos(angle) * radius,
    )
    this.camera.lookAt(0, 0, 0)

    // Render display scene to screen
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  // ── stepGOL ───────────────────────────────────────────────────────────────
  /** One ping-pong GOL simulation step. */
  private stepGOL(): void {
    if (this.readIsA) {
      // Read A → write B
      this.golMatB.uniforms.uState.value = this.rtA.texture
      this.simMesh.material = this.golMatB
      this.renderer.setRenderTarget(this.rtB)
      this.renderer.render(this.simScene, this.simCam)
      this.readIsA = false
    } else {
      // Read B → write A
      this.golMatA.uniforms.uState.value = this.rtB.texture
      this.simMesh.material = this.golMatA
      this.renderer.setRenderTarget(this.rtA)
      this.renderer.render(this.simScene, this.simCam)
      this.readIsA = true
    }
  }

  // ── resize ────────────────────────────────────────────────────────────────
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  // ── destroy ───────────────────────────────────────────────────────────────
  destroy(): void {
    this.canvas.removeEventListener('click', this.clickHandler)
    this.rtA.dispose()
    this.rtB.dispose()
    this.golMatA.dispose()
    this.golMatB.dispose()
    this.displayMat.dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
