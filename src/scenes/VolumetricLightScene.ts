import * as THREE from 'three'
import type { SceneModule } from '../types'

const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position,1.0); }`

const GOD_RAYS_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2      uLightPos;     // light in screen NDC [0..1]
uniform float     uTime;
varying vec2 vUv;

const int SAMPLES = 60;

void main() {
  vec2  tc    = vUv;
  vec2  delta = (tc - uLightPos) / float(SAMPLES);
  float illum = 0.0;
  float decay = 1.0;

  for (int i = 0; i < SAMPLES; i++) {
    tc -= delta;
    vec3 samp  = texture2D(tScene, tc).rgb;
    float lum  = dot(samp, vec3(0.33));
    illum     += lum * decay;
    decay     *= 0.97;
  }
  illum *= 0.015;

  vec3 sceneCol = texture2D(tScene, vUv).rgb;
  float pulse   = 0.9 + 0.1 * sin(uTime * 0.8);
  vec3 godrays  = illum * vec3(1.0, 0.92, 0.6) * pulse;

  gl_FragColor = vec4(sceneCol + godrays, 1.0);
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
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.mainScene = new THREE.Scene()
    this.postScene = new THREE.Scene()
    this.mainScene.background = new THREE.Color(0x040408)

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 50)
    this.camera.position.set(0, 0.5, 5)
    this.camera.lookAt(0, 0, 0)

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // Bright "sun" / light source
    const sunGeo = new THREE.SphereGeometry(0.18, 16, 16)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffcc })
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat)
    this.sunMesh.position.set(-1.5, 2.5, -3)
    this.mainScene.add(this.sunMesh)

    // Point light from sun
    const sunLight = new THREE.PointLight(0xfff4aa, 8, 20)
    sunLight.position.copy(this.sunMesh.position)
    this.mainScene.add(sunLight)

    this.mainScene.add(new THREE.AmbientLight(0x112233, 0.5))

    // Dark blocking objects (these create the "shadow" for god rays)
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18, roughness: 0.9 })
    const objects = [
      { geo: new THREE.BoxGeometry(0.5, 2.5, 0.5), pos: [-1.5, -0.5, 0] as [number,number,number] },
      { geo: new THREE.BoxGeometry(0.5, 1.8, 0.5), pos: [0, 0, 0] as [number,number,number] },
      { geo: new THREE.BoxGeometry(0.5, 2.2, 0.5), pos: [1.5, -0.2, 0] as [number,number,number] },
      { geo: new THREE.SphereGeometry(0.5, 16, 16), pos: [-0.7, 0, -1] as [number,number,number] },
      { geo: new THREE.ConeGeometry(0.4, 1.8, 8),  pos: [0.8, 0, -0.5] as [number,number,number] },
    ]

    objects.forEach(({ geo, pos }) => {
      const mesh = new THREE.Mesh(geo, blockMat)
      mesh.position.set(...pos)
      this.mainScene.add(mesh)
      this.meshes.push(mesh)
    })

    // Compute initial sun screen position
    const proj = new THREE.Vector3()
    proj.copy(this.sunMesh.position).project(this.camera)
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

    // Gently animate the sun position
    const sunX = Math.sin(time * 0.2) * 0.5 - 1.5
    const sunY = 2.5 + Math.sin(time * 0.15) * 0.3
    this.sunMesh.position.set(sunX, sunY, -3)

    // Re-project to screen space
    const proj = new THREE.Vector3()
    proj.copy(this.sunMesh.position).project(this.camera)
    const luv = this.postUniforms['uLightPos'].value as THREE.Vector2
    luv.set(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5)

    this.meshes.forEach((m, i) => { m.rotation.y = time * 0.1 * (i % 2 === 0 ? 1 : -1) })

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
