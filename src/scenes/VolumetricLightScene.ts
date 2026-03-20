import * as THREE from 'three'
import type { SceneModule } from '../types'

const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position,1.0); }`

// Screen-space god-rays: march from each pixel toward the light, accumulate brightness
const GOD_RAYS_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2      uLightPos;   // light NDC [0..1]
uniform float     uExposure;
varying vec2 vUv;

const int SAMPLES = 120;

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
    decay     *= 0.975;          // slow decay = long, sweeping rays
  }
  illum *= uExposure;

  vec3 scene  = texture2D(tScene, vUv).rgb;
  // Warm golden shafts
  vec3 rays   = illum * vec3(1.0, 0.80, 0.30);
  gl_FragColor = vec4(scene + rays, 1.0);
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
  private sunGroup!: THREE.Group   // move sun + light together

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.mainScene = new THREE.Scene()
    this.mainScene.background = new THREE.Color(0x010108)
    this.postScene = new THREE.Scene()

    // Camera looks straight ahead — predictable frustum math
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 80)
    this.camera.position.set(0, 1, 8)
    this.camera.lookAt(0, 1, 0)    // horizontal line of sight

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    this.rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // ── Sun ───────────────────────────────────────────────────────────────
    // Placed at (0, 5, -4): from camera (0,1,8) the angle up is
    // atan((5-1) / 12) ≈ 18.4°, which is ~67% of 27.5° half-FOV → upper-center ✓
    this.sunGroup = new THREE.Group()
    this.sunGroup.position.set(0, 5, -4)
    this.mainScene.add(this.sunGroup)

    // Core — solid bright white so the god-ray pass has strong source pixels
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    this.sunGroup.add(core)

    // Mid halo
    const halo1 = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffce0, transparent: true, opacity: 0.5 }),
    )
    this.sunGroup.add(halo1)

    // Outer halo
    const halo2 = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4a0, transparent: true, opacity: 0.2 }),
    )
    this.sunGroup.add(halo2)

    // Point light radiating warm light
    const sunLight = new THREE.PointLight(0xffe090, 12, 40)
    this.sunGroup.add(sunLight)

    // Very dim fill so pillars show a hint of shape
    this.mainScene.add(new THREE.AmbientLight(0x0a0818, 1.0))

    // ── Ground plane ──────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x060410, roughness: 1.0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.5
    this.mainScene.add(ground)

    // ── Pillars — 7 wide columns creating clear alternating shafts ────────
    // At z=0 (8 units from camera), half-width = 8*tan(27.5°) ≈ 4.16
    // Place pillars at x = -3, -2, -1, 0, 1, 2, 3 with radius 0.28
    // Gap between faces = 1.0 - 0.56 = 0.44 — wide enough for clear shafts
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x020210, roughness: 1.0 })
    const PILLAR_R = 0.28
    const PILLAR_H = 12

    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 1.1   // x: -3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3
      const z = (i % 2 === 0 ? 0.0 : 0.5)  // slight depth variation

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.1, PILLAR_H, 8),
        pillarMat,
      )
      pillar.position.set(x, PILLAR_H / 2 - 0.5, z)
      this.mainScene.add(pillar)
    }

    // A few background pillars for depth
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 2.2 + 0.55
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, PILLAR_H, 7),
        pillarMat,
      )
      pillar.position.set(x, PILLAR_H / 2 - 0.5, -2.5)
      this.mainScene.add(pillar)
    }

    // ── Post-process setup ────────────────────────────────────────────────
    const proj = new THREE.Vector3().copy(this.sunGroup.position).project(this.camera)
    const lightUV = new THREE.Vector2(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5)

    this.postUniforms = {
      tScene:    { value: this.rt.texture },
      uLightPos: { value: lightUV },
      uExposure: { value: 0.09 },   // strong but not blown-out
    }

    const postMat = new THREE.ShaderMaterial({
      uniforms: this.postUniforms,
      vertexShader: POST_VERT,
      fragmentShader: GOD_RAYS_FRAG,
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat))
  }

  update(time: number): void {
    // Very gentle sun drift — stays near top-center at all times
    const sunX = Math.sin(time * 0.07) * 0.8
    this.sunGroup.position.set(sunX, 5, -4)

    // Re-project to screen-space every frame
    const proj = new THREE.Vector3().copy(this.sunGroup.position).project(this.camera)
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
