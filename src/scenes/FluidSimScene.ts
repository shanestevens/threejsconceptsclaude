import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const RES    = 256
const TEXEL  = new THREE.Vector2(1.0 / RES, 1.0 / RES)
const DT     = 1.5
const RADIUS = 0.025
const JACOBI_ITERATIONS = 25

// ── Shaders ───────────────────────────────────────────────────────────────────

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`

// Pass 1: Advect velocity
const ADVECT_VEL_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uVel;
uniform float uDt;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 vel = texture2D(uVel, vUv).xy;
  vec2 prevUv = vUv - vel * uDt * uTexel;
  prevUv = clamp(prevUv, vec2(0.0), vec2(1.0));
  gl_FragColor = vec4(texture2D(uVel, prevUv).xy, 0.0, 1.0);
}
`

// Pass 2: Splat force
const SPLAT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uVel;
uniform vec2 uMouse;
uniform vec2 uForce;
uniform float uRadius;
uniform float uActive;
varying vec2 vUv;
void main() {
  vec2 vel = texture2D(uVel, vUv).xy;
  float d = distance(vUv, uMouse);
  float splat = exp(-d*d / (uRadius*uRadius)) * uActive;
  vel += uForce * splat;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`

// Pass 3: Divergence
const DIVERGENCE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uVel;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).y;
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

// Pass 4: Pressure Jacobi
const JACOBI_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  float p = (L + R + B + T - div) * 0.25;
  gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
}
`

// Pass 5: Gradient subtract
const GRAD_SUB_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uVel;
uniform sampler2D uPressure;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float pL = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float pR = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float pB = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float pT = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture2D(uVel, vUv).xy;
  vel -= 0.5 * vec2(pR - pL, pT - pB);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`

// Pass 6: Advect dye
const ADVECT_DYE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform float uDt;
uniform vec2 uTexel;
uniform vec2 uMouse;
uniform vec3 uDyeColor;
uniform float uRadius;
uniform float uActive;
varying vec2 vUv;
void main() {
  vec2 vel = texture2D(uVel, vUv).xy;
  vec2 prevUv = vUv - vel * uDt * uTexel;
  prevUv = clamp(prevUv, vec2(0.0), vec2(1.0));
  vec3 dye = texture2D(uDye, prevUv).rgb;
  dye *= 0.998;
  float d = distance(vUv, uMouse);
  float splat = exp(-d*d / (uRadius*uRadius)) * uActive;
  dye += uDyeColor * splat;
  gl_FragColor = vec4(dye, 1.0);
}
`

// Pass 7: Display
const DISPLAY_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDye;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(uDye, vUv).rgb;
  col = pow(col, vec3(0.7));
  gl_FragColor = vec4(col, 1.0);
}
`

// ── Scene class ───────────────────────────────────────────────────────────────
export class FluidSimScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private displayScene!: THREE.Scene
  private simScene!: THREE.Scene
  private orthoCam!: THREE.OrthographicCamera
  private simQuad!: THREE.Mesh

  // Render targets
  private velA!: THREE.WebGLRenderTarget
  private velB!: THREE.WebGLRenderTarget
  private divRT!: THREE.WebGLRenderTarget
  private pressA!: THREE.WebGLRenderTarget
  private pressB!: THREE.WebGLRenderTarget
  private dyeA!: THREE.WebGLRenderTarget
  private dyeB!: THREE.WebGLRenderTarget

  // Shader materials
  private matAdvectVel!: THREE.ShaderMaterial
  private matSplat!: THREE.ShaderMaterial
  private matDiv!: THREE.ShaderMaterial
  private matJacobi!: THREE.ShaderMaterial
  private matGradSub!: THREE.ShaderMaterial
  private matAdvectDye!: THREE.ShaderMaterial
  private matDisplay!: THREE.ShaderMaterial

  // Mouse state
  private mouse = new THREE.Vector2(0.5, 0.5)
  private lastMouse = new THREE.Vector2(0.5, 0.5)
  private mouseActive = false
  private dyeHue = 0

  private _canvas!: HTMLCanvasElement
  private _onMouseMove!: (e: MouseEvent) => void
  private _onMouseDown!: (e: MouseEvent) => void
  private _onMouseUp!: () => void

  // ── init ──────────────────────────────────────────────────────────────────
  init(canvas: HTMLCanvasElement): void {
    this._canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)

    // Orthographic camera for fullscreen quad rendering
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Render target options
    const rtOpts: THREE.RenderTargetOptions = {
      type:      THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
    }

    // Create all render targets
    this.velA   = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.velB   = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.divRT  = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.pressA = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.pressB = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.dyeA   = new THREE.WebGLRenderTarget(RES, RES, rtOpts)
    this.dyeB   = new THREE.WebGLRenderTarget(RES, RES, rtOpts)

    // Shader materials
    this.matAdvectVel = new THREE.ShaderMaterial({
      uniforms: {
        uVel:   { value: this.velA.texture },
        uDt:    { value: DT },
        uTexel: { value: TEXEL },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: ADVECT_VEL_FRAG,
    })

    this.matSplat = new THREE.ShaderMaterial({
      uniforms: {
        uVel:    { value: this.velB.texture },
        uMouse:  { value: new THREE.Vector2(0.5, 0.5) },
        uForce:  { value: new THREE.Vector2(0.0, 0.0) },
        uRadius: { value: RADIUS },
        uActive: { value: 0.0 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: SPLAT_FRAG,
    })

    this.matDiv = new THREE.ShaderMaterial({
      uniforms: {
        uVel:   { value: this.velA.texture },
        uTexel: { value: TEXEL },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: DIVERGENCE_FRAG,
    })

    this.matJacobi = new THREE.ShaderMaterial({
      uniforms: {
        uPressure:   { value: this.pressA.texture },
        uDivergence: { value: this.divRT.texture },
        uTexel:      { value: TEXEL },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: JACOBI_FRAG,
    })

    this.matGradSub = new THREE.ShaderMaterial({
      uniforms: {
        uVel:      { value: this.velA.texture },
        uPressure: { value: this.pressA.texture },
        uTexel:    { value: TEXEL },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: GRAD_SUB_FRAG,
    })

    this.matAdvectDye = new THREE.ShaderMaterial({
      uniforms: {
        uDye:      { value: this.dyeA.texture },
        uVel:      { value: this.velB.texture },
        uDt:       { value: DT },
        uTexel:    { value: TEXEL },
        uMouse:    { value: new THREE.Vector2(0.5, 0.5) },
        uDyeColor: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
        uRadius:   { value: RADIUS },
        uActive:   { value: 0.0 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: ADVECT_DYE_FRAG,
    })

    this.matDisplay = new THREE.ShaderMaterial({
      uniforms: {
        uDye: { value: this.dyeB.texture },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: DISPLAY_FRAG,
    })

    // Sim scene: single quad, material swapped each pass
    this.simScene = new THREE.Scene()
    const simGeo  = new THREE.PlaneGeometry(2, 2)
    this.simQuad  = new THREE.Mesh(simGeo, this.matAdvectVel)
    this.simScene.add(this.simQuad)

    // Display scene: separate quad permanently using matDisplay
    this.displayScene = new THREE.Scene()
    const displayGeo  = new THREE.PlaneGeometry(2, 2)
    const displayMesh = new THREE.Mesh(displayGeo, this.matDisplay)
    this.displayScene.add(displayMesh)

    // Mouse events
    this._onMouseMove = (e: MouseEvent) => {
      const rect = this._canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = 1.0 - (e.clientY - rect.top) / rect.height
      this.mouse.set(x, y)
      this.mouseActive = true
    }

    this._onMouseDown = (e: MouseEvent) => {
      const rect = this._canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = 1.0 - (e.clientY - rect.top) / rect.height
      this.mouse.set(x, y)
      this.mouseActive = true
    }

    this._onMouseUp = () => {
      this.mouseActive = false
    }

    canvas.addEventListener('mousemove', this._onMouseMove)
    canvas.addEventListener('mousedown', this._onMouseDown)
    canvas.addEventListener('mouseup',   this._onMouseUp)
    window.addEventListener('mouseup',   this._onMouseUp)
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(_time: number): void {
    const renderer   = this.renderer
    const simScene   = this.simScene
    const orthoCam   = this.orthoCam
    const quad       = this.simQuad

    // Advance dye hue for rainbow colors
    this.dyeHue = (this.dyeHue + 0.002) % 1

    // Compute force from mouse delta
    const force = new THREE.Vector2()
      .subVectors(this.mouse, this.lastMouse)
      .multiplyScalar(300)

    // Compute dye color from hue
    const dyeColor = new THREE.Color().setHSL(this.dyeHue, 1, 0.6)

    // ── Pass 1: Advect velocity — velA → velB ────────────────────────────────
    quad.material = this.matAdvectVel
    this.matAdvectVel.uniforms.uVel.value = this.velA.texture
    renderer.setRenderTarget(this.velB)
    renderer.render(simScene, orthoCam)

    // ── Pass 2: Splat force — velB → velA ────────────────────────────────────
    quad.material = this.matSplat
    this.matSplat.uniforms.uVel.value    = this.velB.texture
    this.matSplat.uniforms.uMouse.value  = this.mouse
    this.matSplat.uniforms.uForce.value  = force
    this.matSplat.uniforms.uActive.value = this.mouseActive ? 1.0 : 0.0
    renderer.setRenderTarget(this.velA)
    renderer.render(simScene, orthoCam)

    // ── Pass 3: Divergence — velA → divRT ────────────────────────────────────
    quad.material = this.matDiv
    this.matDiv.uniforms.uVel.value = this.velA.texture
    renderer.setRenderTarget(this.divRT)
    renderer.render(simScene, orthoCam)

    // ── Pass 4: Jacobi pressure — 25 iterations ping-ponging pressA/pressB ──
    let pressRead  = this.pressA
    let pressWrite = this.pressB

    for (let i = 0; i < JACOBI_ITERATIONS; i++) {
      quad.material = this.matJacobi
      this.matJacobi.uniforms.uPressure.value   = pressRead.texture
      this.matJacobi.uniforms.uDivergence.value  = this.divRT.texture
      renderer.setRenderTarget(pressWrite)
      renderer.render(simScene, orthoCam)
      // Swap read/write
      const tmp  = pressRead
      pressRead  = pressWrite
      pressWrite = tmp
    }
    // pressRead now holds the final pressure result

    // ── Pass 5: Gradient subtract — velA + pressRead → velB ──────────────────
    quad.material = this.matGradSub
    this.matGradSub.uniforms.uVel.value      = this.velA.texture
    this.matGradSub.uniforms.uPressure.value = pressRead.texture
    renderer.setRenderTarget(this.velB)
    renderer.render(simScene, orthoCam)

    // ── Pass 6: Advect dye — dyeA + velB → dyeB ──────────────────────────────
    quad.material = this.matAdvectDye
    this.matAdvectDye.uniforms.uDye.value      = this.dyeA.texture
    this.matAdvectDye.uniforms.uVel.value      = this.velB.texture
    this.matAdvectDye.uniforms.uMouse.value    = this.mouse
    this.matAdvectDye.uniforms.uDyeColor.value = new THREE.Vector3(dyeColor.r, dyeColor.g, dyeColor.b)
    this.matAdvectDye.uniforms.uActive.value   = this.mouseActive ? 1.0 : 0.0
    renderer.setRenderTarget(this.dyeB)
    renderer.render(simScene, orthoCam)

    // ── Pass 7: Display — dyeB to screen ─────────────────────────────────────
    this.matDisplay.uniforms.uDye.value = this.dyeB.texture
    renderer.setRenderTarget(null)
    renderer.render(this.displayScene, orthoCam)

    // ── Swap buffers ──────────────────────────────────────────────────────────
    // velB is the divergence-free velocity — becomes velA for next frame
    const tmpVel  = this.velA
    this.velA     = this.velB
    this.velB     = tmpVel

    // dyeB is the updated dye — becomes dyeA for next frame
    const tmpDye  = this.dyeA
    this.dyeA     = this.dyeB
    this.dyeB     = tmpDye

    // Sync pressA to the final pressure result
    if (pressRead === this.pressB) {
      const tmpP    = this.pressA
      this.pressA   = this.pressB
      this.pressB   = tmpP
    }

    this.lastMouse.copy(this.mouse)
  }

  // ── resize ────────────────────────────────────────────────────────────────
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
  }

  // ── destroy ───────────────────────────────────────────────────────────────
  destroy(): void {
    this._canvas.removeEventListener('mousemove', this._onMouseMove)
    this._canvas.removeEventListener('mousedown', this._onMouseDown)
    this._canvas.removeEventListener('mouseup',   this._onMouseUp)
    window.removeEventListener('mouseup',          this._onMouseUp)

    this.velA.dispose()
    this.velB.dispose()
    this.divRT.dispose()
    this.pressA.dispose()
    this.pressB.dispose()
    this.dyeA.dispose()
    this.dyeB.dispose()

    this.matAdvectVel.dispose()
    this.matSplat.dispose()
    this.matDiv.dispose()
    this.matJacobi.dispose()
    this.matGradSub.dispose()
    this.matAdvectDye.dispose()
    this.matDisplay.dispose()

    this.renderer.dispose()
  }

  get orbitCamera(): undefined { return undefined }
}
