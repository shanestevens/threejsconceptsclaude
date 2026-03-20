import * as THREE from 'three'
import type { SceneModule } from '../types'

// ─── Vertex Shader ────────────────────────────────────────────────────────────

const vertexShader = /* glsl */`
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  struct Wave {
    vec2  dir;
    float wavelength;
    float amplitude;
    float steepness;
    float speed;
  };

  // Returns (xOffset, yOffset, zOffset) displacement from a single Gerstner wave
  vec3 gerstnerDisplace(Wave w, vec3 pos) {
    float k   = 2.0 * 3.14159265 / w.wavelength;
    float c   = sqrt(9.8 / k);
    float omg = c * w.speed;
    float f   = k * (dot(w.dir, vec2(pos.x, pos.z)) - omg * uTime);
    float s   = w.steepness * w.amplitude;
    return vec3(
      s * w.dir.x * cos(f),
      w.amplitude * sin(f),
      s * w.dir.y * cos(f)
    );
  }

  // Normal contribution of a single Gerstner wave at displaced position
  // Returns (dNx, dNy, dNz) – partial-derivative-based normal delta
  vec3 gerstnerNormal(Wave w, vec3 pos) {
    float k   = 2.0 * 3.14159265 / w.wavelength;
    float c   = sqrt(9.8 / k);
    float omg = c * w.speed;
    float f   = k * (dot(w.dir, vec2(pos.x, pos.z)) - omg * uTime);
    float wa  = k * w.amplitude;
    float s   = w.steepness;
    return vec3(
      -w.dir.x * wa * cos(f),
      -s * wa * sin(f),
      -w.dir.y * wa * cos(f)
    );
  }

  void main() {
    Wave waves[4];
    waves[0] = Wave(normalize(vec2(1.0,  0.0)),  8.0,  0.30, 0.5, 1.0);
    waves[1] = Wave(normalize(vec2(0.7,  0.7)),  5.0,  0.20, 0.4, 1.2);
    waves[2] = Wave(normalize(vec2(-0.3, 1.0)), 12.0,  0.15, 0.3, 0.8);
    waves[3] = Wave(normalize(vec2(1.0, -0.5)),  3.0,  0.08, 0.6, 1.5);

    vec3 pos = position;

    // Accumulate displacement
    vec3 disp = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      disp += gerstnerDisplace(waves[i], pos);
    }

    vec3 displacedPos = pos + vec3(disp.x, disp.y, disp.z);

    // Accumulate normal deltas
    vec3 nd = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      nd += gerstnerNormal(waves[i], pos);
    }
    // Analytical normal: start from (0,1,0) and apply wave derivatives
    vec3 N = normalize(vec3(nd.x, 1.0 + nd.y, nd.z));

    // World-space normal (plane is rotated -PI/2 on X in the scene, but we
    // handle it in the scene setup so here we just transform with normalMatrix)
    vNormal   = normalize(normalMatrix * N);
    vWorldPos = (modelMatrix * vec4(displacedPos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
  }
`

// ─── Fragment Shader ──────────────────────────────────────────────────────────

const fragmentShader = /* glsl */`
  uniform vec3 cameraPos;   // provided automatically by Three.js ShaderMaterial

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 deepColor    = vec3(0.01, 0.05, 0.15);
    vec3 surfaceColor = vec3(0.05, 0.18, 0.35);

    vec3  N    = normalize(vNormal);
    vec3  V    = normalize(cameraPos - vWorldPos);
    float NdV  = max(dot(N, V), 0.0);

    // Fresnel – stronger at grazing angles
    float fresnel = pow(1.0 - NdV, 3.0);

    // Base water colour
    vec3 color = mix(deepColor, surfaceColor, 0.5 + 0.5 * fresnel);

    // Foam where wave crest is high
    float foam = smoothstep(0.4, 0.6, vWorldPos.y) * 0.3;
    color += vec3(foam);

    // Specular from sun
    vec3  sunDir  = normalize(vec3(0.5, 1.0, 0.3));
    vec3  H       = normalize(sunDir + V);
    float spec    = pow(max(dot(N, H), 0.0), 128.0);
    color += vec3(spec * 1.5);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Scene ────────────────────────────────────────────────────────────────────

interface Buoy {
  mesh: THREE.Mesh
  offset: number
}

export class OceanScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!:    THREE.Scene
  private camera!:   THREE.PerspectiveCamera

  private oceanMaterial!: THREE.ShaderMaterial
  private buoys: Buoy[] = []

  // ── init ──────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()
    const w = width  || canvas.width  || 800
    const h = height || canvas.height || 600

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2

    // ── Scene ──
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog        = new THREE.Fog(0x87ceeb, 20, 60)

    // ── Camera ──
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200)
    this.camera.position.set(0, 4, 10)
    this.camera.lookAt(0, 0, 0)

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0x88aacc, 0.6)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff4d0, 2.5)
    sun.position.set(10, 20, 5)
    this.scene.add(sun)

    // ── Ocean mesh ──
    this.oceanMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
      },
      side: THREE.DoubleSide,
    })

    const oceanGeo  = new THREE.PlaneGeometry(20, 20, 128, 128)
    const oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial)
    oceanMesh.rotation.x = -Math.PI / 2
    oceanMesh.position.y = 0
    this.scene.add(oceanMesh)

    // ── Buoys / rocks for scale ──
    const buoyPositions: [number, number, number, number][] = [
      [-4,  0,  -3, 0.0],
      [ 3,  0,  -5, 1.2],
      [-6,  0,   2, 2.5],
      [ 5,  0,   3, 0.7],
    ]

    const buoyGeos: THREE.BufferGeometry[] = [
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.BoxGeometry(0.35, 0.25, 0.35),
      new THREE.SphereGeometry(0.18, 8, 8),
    ]

    const buoyMat = new THREE.MeshStandardMaterial({
      color:     0x2a1a0a,
      roughness: 0.9,
      metalness: 0.1,
    })

    buoyPositions.forEach(([x, _y, z, offset], i) => {
      const mesh = new THREE.Mesh(buoyGeos[i], buoyMat)
      mesh.position.set(x, 0, z)
      this.scene.add(mesh)
      this.buoys.push({ mesh, offset })
    })
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(time: number): void {
    // Update wave time uniform
    this.oceanMaterial.uniforms.uTime.value = time

    // Bob the buoys
    for (const buoy of this.buoys) {
      buoy.mesh.position.y = Math.sin(time + buoy.offset) * 0.15
    }

    // Very slow camera orbit
    this.camera.position.x = Math.sin(time * 0.05) * 12
    this.camera.position.z = Math.cos(time * 0.05) * 12
    this.camera.position.y = 4
    this.camera.lookAt(0, 0, 0)

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
    this.renderer.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
  }

  // ── orbitCamera ───────────────────────────────────────────────────────────

  get orbitCamera(): THREE.Camera {
    return this.camera
  }
}
