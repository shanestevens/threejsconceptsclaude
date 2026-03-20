import * as THREE from 'three'
import type { SceneModule } from '../types'

export class HologramScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private shaderRefs: THREE.WebGLProgramParametersWithUniforms[] = []
  private meshes: THREE.Mesh[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 5)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0x88ffee, 3.0)
    dir.position.set(3, 4, 3)
    this.scene.add(dir)

    const geos = [
      { geo: new THREE.TorusKnotGeometry(0.7, 0.22, 128, 16), x: -1.8 },
      { geo: new THREE.SphereGeometry(0.75, 64, 32), x: 0 },
      { geo: new THREE.IcosahedronGeometry(0.75, 2), x: 1.8 },
    ]

    geos.forEach(({ geo, x }) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        side: THREE.DoubleSide,
      })

      // onBeforeCompile — inject hologram effects into MeshStandardMaterial's GLSL
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }

        // Inject varyings into vertex shader
        shader.vertexShader = `
          varying vec3 vHoloNormal;
          varying vec3 vHoloViewDir;
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vHoloNormal  = normalize(normalMatrix * normal);
          vHoloViewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);`
        )

        // Inject hologram post-processing into fragment shader
        shader.fragmentShader = `
          uniform float uTime;
          varying vec3 vHoloNormal;
          varying vec3 vHoloViewDir;
          ${shader.fragmentShader}
        `.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>

          // Scanlines
          float line = step(0.45, fract(gl_FragCoord.y * 0.12 + uTime * 1.8));
          gl_FragColor.rgb *= 0.65 + 0.35 * line;

          // Fresnel edge glow
          float fresnel = pow(1.0 - abs(dot(vHoloNormal, vHoloViewDir)), 2.5);
          gl_FragColor.rgb += fresnel * vec3(0.0, 1.0, 0.85) * 2.0;

          // Hologram colour tint toward cyan
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0, 0.95, 0.80), 0.45);

          // Flicker
          float flicker = 0.93 + 0.07 * sin(uTime * 47.0 + gl_FragCoord.y * 0.01);
          gl_FragColor.rgb *= flicker;

          // Alpha driven by fresnel
          gl_FragColor.a = (0.5 + 0.5 * fresnel) * flicker;`
        )

        this.shaderRefs.push(shader)
      }

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.x = x
      this.scene.add(mesh)
      this.meshes.push(mesh)
    })
  }

  update(time: number): void {
    this.shaderRefs.forEach((s) => {
      if (s.uniforms['uTime']) s.uniforms['uTime'].value = time
    })
    this.meshes.forEach((m, i) => {
      m.rotation.y = time * (0.3 + i * 0.1)
      m.rotation.x = time * 0.15
    })
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
