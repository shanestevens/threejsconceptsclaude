import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────
const SIZE  = 64   // 64×64 = 4 096 boids
const STEPX = 8    // sample every 8th column  → 8 samples
const STEPY = 8    // sample every 8th row     → 8 samples  (64 neighbours total)

// ── Shaders ───────────────────────────────────────────────────────────────────
const QUAD_VERT = /* glsl */`void main() { gl_Position = vec4(position, 1.0); }`

// Velocity update — boid rules (separation · alignment · cohesion)
const VEL_FRAG = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float     uDelta;

void main() {
  vec2 uv  = gl_FragCoord.xy / ${SIZE}.0;
  vec3 pos = texture2D(uPos, uv).xyz;
  vec3 vel = texture2D(uVel, uv).xyz;

  vec3  sep = vec3(0.0);
  vec3  ali = vec3(0.0);
  vec3  coh = vec3(0.0);
  float cnt = 0.0;

  for (int iy = 0; iy < ${SIZE / STEPY}; iy++) {
    for (int ix = 0; ix < ${SIZE / STEPX}; ix++) {
      vec2 nuv  = (vec2(float(ix * ${STEPX}), float(iy * ${STEPY})) + 0.5) / ${SIZE}.0;
      vec3 nPos = texture2D(uPos, nuv).xyz;
      vec3 nVel = texture2D(uVel, nuv).xyz;
      vec3 diff = pos - nPos;
      float d   = length(diff);
      if (d > 0.001 && d < 3.5) {
        if (d < 0.7) sep += normalize(diff) * (0.7 - d) / 0.7;
        ali += normalize(nVel);
        coh += nPos;
        cnt += 1.0;
      }
    }
  }

  vec3 steer = vec3(0.0);
  if (cnt > 0.0) {
    steer += sep * 3.0;
    steer += (ali / cnt - normalize(vel)) * 1.0;
    steer += (coh / cnt - pos) * 0.4;
  }

  // Soft containment — push back if outside radius 2.8
  float r = length(pos);
  if (r > 2.8) steer -= normalize(pos) * (r - 2.8) * 3.0;

  vec3 newVel = vel + steer * uDelta;
  float spd   = length(newVel);
  // Clamp speed to [1.2, 5.0]
  newVel = newVel / max(spd, 0.001) * clamp(spd, 1.2, 5.0);

  gl_FragColor = vec4(newVel, 1.0);
}
`

// Position update — integrate velocity
const POS_FRAG = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float     uDelta;

void main() {
  vec2 uv  = gl_FragCoord.xy / ${SIZE}.0;
  vec3 pos = texture2D(uPos, uv).xyz;
  vec3 vel = texture2D(uVel, uv).xyz;
  gl_FragColor = vec4(pos + vel * uDelta, 1.0);
}
`

// Display — point sprite, colour by speed
const BOID_VERT = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uVel;
varying float     vSpeed;

void main() {
  vec3 pos  = texture2D(uPos, uv).xyz;
  vec3 vel  = texture2D(uVel, uv).xyz;
  vSpeed    = clamp(length(vel) / 5.0, 0.0, 1.0);
  vec4 mv   = modelViewMatrix * vec4(pos, 1.0);
  gl_Position  = projectionMatrix * mv;
  gl_PointSize = (2.0 + vSpeed * 2.5) * (280.0 / -mv.z);
}
`

const BOID_FRAG = /* glsl */`
varying float vSpeed;

void main() {
  vec2  d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;

  // Cyan (slow) → violet → orange (fast)
  vec3 c0 = vec3(0.0,  0.85, 1.0);
  vec3 c1 = vec3(0.65, 0.25, 1.0);
  vec3 c2 = vec3(1.0,  0.35, 0.05);
  vec3 col = vSpeed < 0.5
    ? mix(c0, c1, vSpeed * 2.0)
    : mix(c1, c2, (vSpeed - 0.5) * 2.0);

  float alpha = smoothstep(0.5, 0.12, r);
  gl_FragColor = vec4(col * (0.75 + vSpeed * 0.25), alpha * 0.95);
}
`

// ── Scene class ───────────────────────────────────────────────────────────────
export class GPGPUScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private simScene!: THREE.Scene
  private simCam!:   THREE.OrthographicCamera
  private simMesh!:  THREE.Mesh
  private velMat!:   THREE.ShaderMaterial
  private posMat!:   THREE.ShaderMaterial
  private boidMat!:  THREE.ShaderMaterial

  private posA!: THREE.WebGLRenderTarget
  private posB!: THREE.WebGLRenderTarget
  private velA!: THREE.WebGLRenderTarget
  private velB!: THREE.WebGLRenderTarget

  // current-frame read sources (start as DataTextures, become RT textures after frame 0)
  private posRead!: THREE.Texture
  private velRead!: THREE.Texture
  private frame     = 0
  private prevTime  = 0

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 50)
    this.camera.position.set(2, 2, 8)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // ── Render targets ───────────────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType,
    }
    this.posA = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts)
    this.posB = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts)
    this.velA = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts)
    this.velB = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts)

    // ── Seed DataTextures ────────────────────────────────────────────────────
    const posArr = new Float32Array(SIZE * SIZE * 4)
    const velArr = new Float32Array(SIZE * SIZE * 4)

    for (let i = 0; i < SIZE * SIZE; i++) {
      // Random point on a sphere shell, r ∈ [1.2, 2.5]
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r  = 1.2 + Math.random() * 1.3
      posArr[i * 4]     = r * Math.sin(ph) * Math.cos(th)
      posArr[i * 4 + 1] = r * Math.sin(ph) * Math.sin(th)
      posArr[i * 4 + 2] = r * Math.cos(ph)
      posArr[i * 4 + 3] = 1

      // Random initial velocity, speed ~2
      const vt = Math.random() * Math.PI * 2
      const vp = Math.acos(2 * Math.random() - 1)
      velArr[i * 4]     = Math.sin(vp) * Math.cos(vt) * 2
      velArr[i * 4 + 1] = Math.sin(vp) * Math.sin(vt) * 2
      velArr[i * 4 + 2] = Math.cos(vp) * 2
      velArr[i * 4 + 3] = 0
    }

    const posTex = new THREE.DataTexture(posArr, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType)
    posTex.needsUpdate = true
    const velTex = new THREE.DataTexture(velArr, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType)
    velTex.needsUpdate = true

    this.posRead = posTex
    this.velRead = velTex

    // ── Sim scene ─────────────────────────────────────────────────────────────
    this.simScene = new THREE.Scene()
    this.simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad    = new THREE.PlaneGeometry(2, 2)

    this.velMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos:   { value: null },
        uVel:   { value: null },
        uDelta: { value: 0 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: VEL_FRAG,
    })

    this.posMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos:   { value: null },
        uVel:   { value: null },
        uDelta: { value: 0 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: POS_FRAG,
    })

    this.simMesh = new THREE.Mesh(quad, this.velMat)
    this.simScene.add(this.simMesh)

    // ── Display geometry (one point per texel) ───────────────────────────────
    const count  = SIZE * SIZE
    const uvAttr = new Float32Array(count * 2)
    const dummyP = new Float32Array(count * 3)

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const i = row * SIZE + col
        uvAttr[i * 2]     = (col + 0.5) / SIZE
        uvAttr[i * 2 + 1] = (row + 0.5) / SIZE
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(dummyP, 3))
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvAttr, 2))

    this.boidMat = new THREE.ShaderMaterial({
      uniforms:       { uPos: { value: null }, uVel: { value: null } },
      vertexShader:   BOID_VERT,
      fragmentShader: BOID_FRAG,
      transparent:    true,
      depthWrite:     false,
    })

    this.scene.add(new THREE.Points(geo, this.boidMat))
  }

  update(time: number): void {
    const delta = Math.min(time - this.prevTime, 0.05)
    this.prevTime = time

    // Alternate write targets each frame
    const posWrite = this.frame % 2 === 0 ? this.posA : this.posB
    const velWrite = this.frame % 2 === 0 ? this.velA : this.velB

    // ── Velocity pass ─────────────────────────────────────────────────────────
    this.velMat.uniforms.uPos.value   = this.posRead
    this.velMat.uniforms.uVel.value   = this.velRead
    this.velMat.uniforms.uDelta.value = delta
    this.simMesh.material = this.velMat
    this.renderer.setRenderTarget(velWrite)
    this.renderer.render(this.simScene, this.simCam)

    // ── Position pass (reads newly written velocity) ──────────────────────────
    this.posMat.uniforms.uPos.value   = this.posRead
    this.posMat.uniforms.uVel.value   = velWrite.texture
    this.posMat.uniforms.uDelta.value = delta
    this.simMesh.material = this.posMat
    this.renderer.setRenderTarget(posWrite)
    this.renderer.render(this.simScene, this.simCam)

    // Advance read pointers for next frame
    this.posRead = posWrite.texture
    this.velRead = velWrite.texture
    this.frame++

    // ── Display ───────────────────────────────────────────────────────────────
    this.boidMat.uniforms.uPos.value = this.posRead
    this.boidMat.uniforms.uVel.value = this.velRead
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    this.posA.dispose()
    this.posB.dispose()
    this.velA.dispose()
    this.velB.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
