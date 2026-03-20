import * as THREE from 'three'
import type { SceneModule } from '../types'

const VERT = /* glsl */ `
uniform float uTime;
varying float vElevation;
varying vec3  vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0*f);
  return mix(
    mix(hash(i),           hash(i + vec2(1,0)), u.x),
    mix(hash(i+vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y
  ) * 2.0 - 1.0;
}

// Fractal Brownian Motion — 5 octaves
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 pos = position;
  float h = fbm(pos.xz * 0.7 + uTime * 0.06);
  pos.y  += h * 1.8;
  vElevation = h;
  vWorldPos  = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const FRAG = /* glsl */ `
uniform float uTime;
varying float vElevation;
varying vec3  vWorldPos;

void main() {
  // Height-based colour: deep blue → teal → green → tan → white
  float h = clamp(vElevation * 0.5 + 0.5, 0.0, 1.0);

  vec3 deep   = vec3(0.05, 0.12, 0.35);
  vec3 water  = vec3(0.10, 0.45, 0.65);
  vec3 grass  = vec3(0.18, 0.55, 0.18);
  vec3 rock   = vec3(0.50, 0.42, 0.32);
  vec3 snow   = vec3(0.90, 0.92, 0.95);

  vec3 col;
  if      (h < 0.30) col = mix(deep,  water, h/0.30);
  else if (h < 0.50) col = mix(water, grass, (h-0.30)/0.20);
  else if (h < 0.72) col = mix(grass, rock,  (h-0.50)/0.22);
  else               col = mix(rock,  snow,  (h-0.72)/0.28);

  // Simple diffuse lighting from above
  float light = 0.6 + 0.4 * h;
  gl_FragColor = vec4(col * light, 1.0);
}
`

export class ProceduralTerrainScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private uniforms!: { uTime: { value: number } }

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0a1020, 0.08)
    this.scene.background = new THREE.Color(0x0a1020)

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
    this.camera.position.set(0, 4, 9)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.uniforms = { uTime: { value: 0 } }

    const geo = new THREE.PlaneGeometry(20, 20, 200, 200)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    })

    this.scene.add(new THREE.Mesh(geo, mat))

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(2000 * 3)
    for (let i = 0; i < 2000; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 60
      starPos[i * 3 + 1] = Math.random() * 20 + 5
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 60
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })))
  }

  update(time: number): void {
    this.uniforms.uTime.value = time
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
