import * as THREE from 'three'
import type { SceneModule } from '../types'

export class GPUPickingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private mainScene!: THREE.Scene
  private pickScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private pickRT!: THREE.WebGLRenderTarget
  private canvas!: HTMLCanvasElement
  private meshes: THREE.Mesh[] = []
  private idMaterials: THREE.MeshBasicMaterial[] = []
  private displayMaterials: THREE.MeshStandardMaterial[] = []
  private hoveredId = -1
  private mouseX = -1
  private mouseY = -1
  private onMouseMove!: (e: MouseEvent) => void
  private onMouseLeave!: () => void

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()

    this.mainScene = new THREE.Scene()
    this.pickScene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 8)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.pickRT = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })

    this.mainScene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dir = new THREE.DirectionalLight(0xffffff, 3.0)
    dir.position.set(5, 5, 5)
    this.mainScene.add(dir)

    // 4×4 grid of spheres
    const baseColors = [0x6366f1, 0xf97316, 0xec4899, 0x22c55e, 0xeab308, 0x06b6d4, 0xa855f7, 0xef4444,
                        0x10b981, 0x8b5cf6, 0xf43f5e, 0x14b8a6, 0xfbbf24, 0x3b82f6, 0xe879f9, 0x84cc16]

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const objId = r * 4 + c + 1
        const baseColor = baseColors[r * 4 + c]

        // Display material
        const dispMat = new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.3,
          metalness: 0.3,
        })
        this.displayMaterials.push(dispMat)

        // ID material — unique flat colour encoding the object ID
        const idR = (objId >> 16) & 0xff
        const idG = (objId >> 8)  & 0xff
        const idB =  objId        & 0xff
        const idMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(idR / 255, idG / 255, idB / 255),
        })
        this.idMaterials.push(idMat)

        const geo = new THREE.SphereGeometry(0.38, 32, 32)
        const mesh = new THREE.Mesh(geo, dispMat)
        mesh.position.set((c - 1.5) * 1.3, (r - 1.5) * 1.3, 0)
        mesh.userData.id = objId
        this.mainScene.add(mesh)

        // Clone for pick scene (same position, ID material)
        const pickMesh = new THREE.Mesh(geo, idMat)
        pickMesh.position.copy(mesh.position)
        this.pickScene.add(pickMesh)

        this.meshes.push(mesh)
      }
    }

    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouseX = Math.floor((e.clientX - rect.left) * (this.renderer.getPixelRatio()))
      this.mouseY = Math.floor((rect.height - (e.clientY - rect.top) - 1) * (this.renderer.getPixelRatio()))
    }
    this.onMouseLeave = () => { this.mouseX = -1; this.mouseY = -1; this.hoveredId = -1 }

    this.canvas.addEventListener('mousemove', this.onMouseMove)
    this.canvas.addEventListener('mouseleave', this.onMouseLeave)
  }

  update(time: number): void {
    // GPU pick pass
    this.renderer.setRenderTarget(this.pickRT)
    this.renderer.render(this.pickScene, this.camera)

    if (this.mouseX >= 0 && this.mouseY >= 0) {
      const px = new Uint8Array(4)
      this.renderer.readRenderTargetPixels(this.pickRT, this.mouseX, this.mouseY, 1, 1, px)
      this.hoveredId = (px[0] << 16) | (px[1] << 8) | px[2]
    }

    // Update display materials based on pick result
    this.meshes.forEach((mesh, i) => {
      const mat = this.displayMaterials[i]
      const isHovered = mesh.userData.id === this.hoveredId
      mat.emissive.setHex(isHovered ? 0xffffff : 0x000000)
      mat.emissiveIntensity = isHovered ? 0.4 : 0
      mesh.scale.setScalar(isHovered ? 1.2 : 1.0)
      mesh.rotation.y = time * 0.4 + i * 0.2
    })

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.mainScene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.pickRT.setSize(width, height)
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    this.pickRT.dispose()
    this.renderer.dispose()
  }

  get orbitCamera() { return this.camera }
}
