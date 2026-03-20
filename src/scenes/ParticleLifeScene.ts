import * as THREE from 'three'
import type { SceneModule } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const TEX_SIZE    = 23          // 23×23 = 529 texels ≥ 512 particles
const NUM_SPECIES = 5
const R_MIN       = 0.05        // repulsion radius (normalized [0,1] space)
const R_MAX       = 0.2         // attraction cutoff radius

// Attraction matrix: RULES[self][other]. Positive = attract, negative = repel.
// rows: red, yellow, green, cyan, purple
const RULES = [
  [ 0.5, -0.3,  0.2, -0.1,  0.4],
  [ 0.2,  0.5, -0.4,  0.3, -0.2],
  [-0.3,  0.1,  0.5, -0.2,  0.3],
  [ 0.4, -0.2,  0.1,  0.5, -0.3],
  [-0.1,  0.3, -0.2,  0.4,  0.5],
]

// Flatten 5×5 matrix to a 25-element float array for the shader uniform
const RULES_FLAT = RULES.flat()

// Species colors
const SPECIES_COLORS = [
  new THREE.Color('#ef4444'), // red
  new THREE.Color('#fbbf24'), // yellow
  new THREE.Color('#22c55e'), // green
  new THREE.Color('#06b6d4'), // cyan
  new THREE.Color('#a855f7'), // purple
]

// ── Shaders ───────────────────────────────────────────────────────────────────
const QUAD_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`

// Velocity update shader — Particle Life force model
// Position texture layout: (x, y, species_float, 0) all in [0,1]
// Velocity texture layout: (vx, vy, 0, 0)
const VEL_FRAG = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float     uDelta;
uniform float     uRules[25];  // 5x5 flattened attraction matrix

const float TEX  = ${TEX_SIZE}.0;
const float rMin = ${R_MIN};
const float rMax = ${R_MAX};
const int   N    = ${NUM_SPECIES};

// Wrap delta in toroidal [0,1] space to nearest image
vec2 toroidal(vec2 d) {
  if (d.x >  0.5) d.x -= 1.0;
  if (d.x < -0.5) d.x += 1.0;
  if (d.y >  0.5) d.y -= 1.0;
  if (d.y < -0.5) d.y += 1.0;
  return d;
}

void main() {
  vec2  uv    = gl_FragCoord.xy / TEX;
  vec4  pData = texture2D(uPos, uv);
  vec4  vData = texture2D(uVel, uv);

  // Inactive padding texel — pass through unchanged
  if (pData.w < 0.5) {
    gl_FragColor = vData;
    return;
  }

  vec2  pos     = pData.xy;
  int   species = int(pData.z + 0.5);   // round to nearest int
  vec2  vel     = vData.xy;

  vec2 force = vec2(0.0);

  // Iterate over all texels
  for (int row = 0; row < ${TEX_SIZE}; row++) {
    for (int col = 0; col < ${TEX_SIZE}; col++) {
      vec2 nuv   = (vec2(float(col), float(row)) + 0.5) / TEX;
      vec4 nData = texture2D(uPos, nuv);
      vec2 nPos  = nData.xy;
      int  nSp   = int(nData.z + 0.5);

      // Skip inactive padding texels (alpha == 0)
      if (nData.w < 0.5) continue;

      vec2  diff = toroidal(pos - nPos);
      float dist = length(diff);

      if (dist < 0.0001 || dist > rMax) continue;

      vec2 dir = diff / dist;

      if (dist < rMin) {
        // Hard repulsion: push away, linear strength
        float strength = (rMin - dist) / rMin;
        force += dir * strength * 1.0;
      } else {
        // Attraction/repulsion from rules matrix
        int ruleIdx = species * N + nSp;
        float coeff = uRules[ruleIdx];
        // Triangle shape: max force at (rMin+rMax)/2, zero at rMin and rMax
        float t = (dist - rMin) / (rMax - rMin);
        float fMag = coeff * (1.0 - abs(2.0 * t - 1.0));
        force -= dir * fMag;  // negative because dir points from other→self; attraction = toward other
      }
    }
  }

  // Integrate and damp
  vec2 newVel = (vel + force * uDelta) * 0.9;

  // Clamp speed
  float spd = length(newVel);
  if (spd > 0.5) newVel = newVel / spd * 0.5;

  gl_FragColor = vec4(newVel, 0.0, 1.0);
}
`

// Position update — integrate velocity with toroidal wrapping
const POS_FRAG = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float     uDelta;

const float TEX = ${TEX_SIZE}.0;

void main() {
  vec2 uv    = gl_FragCoord.xy / TEX;
  vec4 pData = texture2D(uPos, uv);

  // Pass inactive padding texels through unchanged
  if (pData.w < 0.5) {
    gl_FragColor = pData;
    return;
  }

  vec2 vel = texture2D(uVel, uv).xy;
  vec2 pos = pData.xy + vel * uDelta;

  // Toroidal wrap
  pos = fract(pos + 10.0);  // +10 to keep positive before fract

  gl_FragColor = vec4(pos, pData.z, 1.0);
}
`

// Display vertex shader — reads position from texture by gl_VertexID → UV
// We pass UVs as a buffer attribute since WebGL 1 lacks gl_VertexID
const PARTICLE_VERT = /* glsl */`
uniform sampler2D uPos;
uniform vec3      uColors[5];
varying vec3      vColor;

void main() {
  vec4 pData = texture2D(uPos, uv);
  vec2 pos2d = pData.xy;   // [0,1] space
  int  sp    = int(pData.z + 0.5);

  // Map [0,1] → [-1,1] clip space directly (2D overlay)
  vec2 clip = pos2d * 2.0 - 1.0;

  // Push inactive padding particles off-screen
  if (pData.w < 0.5) clip = vec2(9.0, 9.0);

  // Pick species color
  if      (sp == 0) vColor = uColors[0];
  else if (sp == 1) vColor = uColors[1];
  else if (sp == 2) vColor = uColors[2];
  else if (sp == 3) vColor = uColors[3];
  else              vColor = uColors[4];

  gl_Position  = vec4(clip, 0.0, 1.0);
  gl_PointSize = 4.0;
}
`

const PARTICLE_FRAG = /* glsl */`
varying vec3 vColor;

void main() {
  // Circular point
  vec2  d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;

  float alpha = smoothstep(0.5, 0.2, r);
  gl_FragColor = vec4(vColor, alpha);
}
`

// ── Scene class ───────────────────────────────────────────────────────────────
export class ParticleLifeScene implements SceneModule {
  private renderer!:   THREE.WebGLRenderer

  // Display scene
  private scene!:      THREE.Scene
  private camera!:     THREE.OrthographicCamera

  // GPGPU
  private simScene!:   THREE.Scene
  private simCam!:     THREE.OrthographicCamera
  private simMesh!:    THREE.Mesh
  private velMat!:     THREE.ShaderMaterial
  private posMat!:     THREE.ShaderMaterial

  // Ping-pong render targets
  private posA!:       THREE.WebGLRenderTarget
  private posB!:       THREE.WebGLRenderTarget
  private velA!:       THREE.WebGLRenderTarget
  private velB!:       THREE.WebGLRenderTarget

  private posRead!:    THREE.Texture
  private velRead!:    THREE.Texture
  private frame        = 0
  private prevTime     = 0

  // Display
  private particleMat!: THREE.ShaderMaterial

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0a0a0f, 1)

    // ── Display: orthographic camera covering NDC directly ─────────────────
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.scene  = new THREE.Scene()

    // ── Render targets ────────────────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType,
    }
    this.posA = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE, rtOpts)
    this.posB = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE, rtOpts)
    this.velA = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE, rtOpts)
    this.velB = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE, rtOpts)

    // ── Seed initial positions ─────────────────────────────────────────────
    const total   = TEX_SIZE * TEX_SIZE  // 529 texels
    const posArr  = new Float32Array(total * 4)
    const velArr  = new Float32Array(total * 4)

    for (let i = 0; i < total; i++) {
      if (i < 512) {
        const species = Math.floor((i / 512) * NUM_SPECIES)

        // Cluster each species into a small region to accelerate emergence
        const angle  = Math.random() * Math.PI * 2
        const radius = Math.random() * 0.12
        const cx     = 0.2 + (species % 3) * 0.3
        const cy     = 0.25 + Math.floor(species / 3) * 0.5

        posArr[i * 4]     = cx + Math.cos(angle) * radius
        posArr[i * 4 + 1] = cy + Math.sin(angle) * radius
        posArr[i * 4 + 2] = species
        posArr[i * 4 + 3] = 1.0

        velArr[i * 4]     = (Math.random() - 0.5) * 0.02
        velArr[i * 4 + 1] = (Math.random() - 0.5) * 0.02
        velArr[i * 4 + 2] = 0.0
        velArr[i * 4 + 3] = 1.0
      } else {
        // Padding texels — put them off-screen (won't affect simulation meaningfully)
        posArr[i * 4]     = -1.0
        posArr[i * 4 + 1] = -1.0
        posArr[i * 4 + 2] = 0.0
        posArr[i * 4 + 3] = 0.0  // alpha 0 = inactive marker

        velArr[i * 4]     = 0.0
        velArr[i * 4 + 1] = 0.0
        velArr[i * 4 + 2] = 0.0
        velArr[i * 4 + 3] = 0.0
      }
    }

    const posTex = new THREE.DataTexture(posArr, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat, THREE.FloatType)
    posTex.needsUpdate = true
    const velTex = new THREE.DataTexture(velArr, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat, THREE.FloatType)
    velTex.needsUpdate = true

    this.posRead = posTex
    this.velRead = velTex

    // ── Simulation scene (fullscreen quad) ───────────────────────────────────
    this.simScene = new THREE.Scene()
    this.simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad    = new THREE.PlaneGeometry(2, 2)

    this.velMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos:   { value: null },
        uVel:   { value: null },
        uDelta: { value: 0.016 },
        uRules: { value: RULES_FLAT },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: VEL_FRAG,
    })

    this.posMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos:   { value: null },
        uVel:   { value: null },
        uDelta: { value: 0.016 },
      },
      vertexShader:   QUAD_VERT,
      fragmentShader: POS_FRAG,
    })

    this.simMesh = new THREE.Mesh(quad, this.velMat)
    this.simScene.add(this.simMesh)

    // ── Display geometry — one point per particle texel ────────────────────
    const count  = TEX_SIZE * TEX_SIZE
    const uvAttr = new Float32Array(count * 2)
    const dummyP = new Float32Array(count * 3)  // positions unused (shader overrides)

    for (let row = 0; row < TEX_SIZE; row++) {
      for (let col = 0; col < TEX_SIZE; col++) {
        const i = row * TEX_SIZE + col
        uvAttr[i * 2]     = (col + 0.5) / TEX_SIZE
        uvAttr[i * 2 + 1] = (row + 0.5) / TEX_SIZE
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(dummyP, 3))
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvAttr, 2))

    // Build color array for uniform
    const colorUniforms = SPECIES_COLORS.map(c => new THREE.Vector3(c.r, c.g, c.b))

    this.particleMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos:    { value: null },
        uColors: { value: colorUniforms },
      },
      vertexShader:   PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent:    true,
      depthWrite:     false,
    })

    const points = new THREE.Points(geo, this.particleMat)
    this.scene.add(points)
  }

  update(time: number): void {
    const delta      = Math.min(time - this.prevTime, 0.05)
    this.prevTime    = time

    const posWrite = this.frame % 2 === 0 ? this.posA : this.posB
    const velWrite = this.frame % 2 === 0 ? this.velA : this.velB

    // ── Velocity pass ────────────────────────────────────────────────────────
    this.velMat.uniforms.uPos.value   = this.posRead
    this.velMat.uniforms.uVel.value   = this.velRead
    this.velMat.uniforms.uDelta.value = delta
    this.simMesh.material = this.velMat
    this.renderer.setRenderTarget(velWrite)
    this.renderer.render(this.simScene, this.simCam)

    // ── Position pass ────────────────────────────────────────────────────────
    this.posMat.uniforms.uPos.value   = this.posRead
    this.posMat.uniforms.uVel.value   = velWrite.texture
    this.posMat.uniforms.uDelta.value = delta
    this.simMesh.material = this.posMat
    this.renderer.setRenderTarget(posWrite)
    this.renderer.render(this.simScene, this.simCam)

    // Advance ping-pong
    this.posRead = posWrite.texture
    this.velRead = velWrite.texture
    this.frame++

    // ── Display ───────────────────────────────────────────────────────────────
    this.particleMat.uniforms.uPos.value = this.posRead
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
    // Orthographic camera stays at NDC [-1,1] regardless of aspect ratio
  }

  destroy(): void {
    this.posA.dispose()
    this.posB.dispose()
    this.velA.dispose()
    this.velB.dispose()
    this.velMat.dispose()
    this.posMat.dispose()
    this.particleMat.dispose()
    this.renderer.dispose()
  }

  // No orbit camera — 2D simulation viewed head-on
  get orbitCamera(): undefined {
    return undefined
  }
}
