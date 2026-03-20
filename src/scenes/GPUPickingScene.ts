import * as THREE from 'three'
import type { SceneModule } from '../types'

interface ObjectData {
  mesh: THREE.Mesh
  pickMesh: THREE.Mesh
  dispMat: THREE.MeshStandardMaterial
  idMat: THREE.MeshBasicMaterial
  ring: THREE.Mesh
  ringMat: THREE.MeshStandardMaterial
  id: number
}

export class GPUPickingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private mainScene!: THREE.Scene
  private pickScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private pickRT!: THREE.WebGLRenderTarget
  private canvas!: HTMLCanvasElement
  private objects: ObjectData[] = []
  private hoveredId = -1
  private mouseX = -1
  private mouseY = -1
  private onMouseMove!: (e: MouseEvent) => void
  private onMouseLeave!: () => void
  private _height = 1

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    const { width, height } = canvas.getBoundingClientRect()
    this._height = height

    this.mainScene = new THREE.Scene()
    this.pickScene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 9)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // pickRT is always at pixel-ratio 1 so mouse coords map 1:1
    this.pickRT = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })

    // Lighting
    this.mainScene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3)
    keyLight.position.set(5, 5, 5)
    this.mainScene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x4466ff, 1.5)
    fillLight.position.set(-5, -3, -5)
    this.mainScene.add(fillLight)

    // Geometry pool
    const geometries: THREE.BufferGeometry[] = [
      new THREE.SphereGeometry(0.45, 32, 32),
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.TorusKnotGeometry(0.35, 0.12, 64, 8),
      new THREE.OctahedronGeometry(0.5),
      new THREE.ConeGeometry(0.4, 0.8, 16),
    ]

    const ringGeo = new THREE.TorusGeometry(0.72, 0.035, 8, 48)

    const rng = (() => {
      // Simple deterministic-ish seeded RNG so layout is stable on reload
      let s = 42
      return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
    })()

    for (let i = 0; i < 20; i++) {
      const objId = i + 1

      // Unique HSL colour
      const hue = (i / 20) * 360
      const color = new THREE.Color().setHSL(hue / 360, 0.8, 0.6)

      const dispMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0,
        roughness: 0.25,
        metalness: 0.4,
      })

      const idR = (objId >> 16) & 0xff
      const idG = (objId >> 8)  & 0xff
      const idB =  objId        & 0xff
      const idMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(idR / 255, idG / 255, idB / 255),
      })

      const geo = geometries[i % geometries.length]
      const mesh = new THREE.Mesh(geo, dispMat)
      mesh.position.set(
        rng() * 8 - 4,
        rng() * 5 - 2.5,
        rng() * 6 - 3,
      )
      mesh.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
      mesh.userData.id = objId
      mesh.userData.rotSpeed = new THREE.Vector2(
        (rng() - 0.5) * 0.04,
        (rng() - 0.5) * 0.04,
      )

      this.mainScene.add(mesh)

      // Pick mesh — same geometry, same position, ID-encoded material
      const pickMesh = new THREE.Mesh(geo, idMat)
      pickMesh.position.copy(mesh.position)
      pickMesh.rotation.copy(mesh.rotation)
      pickMesh.userData.rotSpeed = mesh.userData.rotSpeed
      this.pickScene.add(pickMesh)

      // Hover ring (hidden by default)
      const ringMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        roughness: 0.1,
        metalness: 0.6,
        transparent: true,
        opacity: 0,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.copy(mesh.position)
      this.mainScene.add(ring)

      this.objects.push({ mesh, pickMesh, dispMat, idMat, ring, ringMat, id: objId })
    }

    // Mouse handling — pickRT is pixel-ratio 1, so no DPR multiplication
    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouseX = Math.floor(e.clientX - rect.left)
      this.mouseY = Math.floor(this._height - (e.clientY - rect.top) - 1)
    }
    this.onMouseLeave = () => { this.mouseX = -1; this.mouseY = -1; this.hoveredId = -1 }

    this.canvas.addEventListener('mousemove', this.onMouseMove)
    this.canvas.addEventListener('mouseleave', this.onMouseLeave)
  }

  private readonly _targetScaleHovered = new THREE.Vector3(1.25, 1.25, 1.25)
  private readonly _targetScaleNormal  = new THREE.Vector3(1.0, 1.0, 1.0)
  private readonly _pickPixel = new Uint8Array(4)

  update(time: number): void {
    const dt = 0.016

    // Slow global oscillation
    this.mainScene.rotation.y = Math.sin(time * 0.1) * 0.3

    // Animate each object
    for (const obj of this.objects) {
      const rs = obj.mesh.userData.rotSpeed as THREE.Vector2
      obj.mesh.rotation.x += rs.x * dt
      obj.mesh.rotation.y += rs.y * dt

      // Keep pick mesh in sync
      obj.pickMesh.rotation.copy(obj.mesh.rotation)
    }

    // Mirror global rotation on pick scene so picking stays aligned
    this.pickScene.rotation.y = this.mainScene.rotation.y

    // GPU pick pass — render at pixel-ratio 1
    const savedPixelRatio = this.renderer.getPixelRatio()
    this.renderer.setPixelRatio(1)
    this.renderer.setRenderTarget(this.pickRT)
    this.renderer.render(this.pickScene, this.camera)
    this.renderer.setPixelRatio(savedPixelRatio)

    if (this.mouseX >= 0 && this.mouseY >= 0) {
      this.renderer.readRenderTargetPixels(this.pickRT, this.mouseX, this.mouseY, 1, 1, this._pickPixel)
      this.hoveredId = (this._pickPixel[0] << 16) | (this._pickPixel[1] << 8) | this._pickPixel[2]
    } else {
      this.hoveredId = -1
    }

    // Update visuals
    const targetScaleHovered = this._targetScaleHovered
    const targetScaleNormal  = this._targetScaleNormal

    for (const obj of this.objects) {
      const isHovered = obj.id === this.hoveredId && this.hoveredId !== 0

      // Emissive pulse
      obj.dispMat.emissiveIntensity = isHovered
        ? 0.8 + 0.2 * Math.sin(time * 6)
        : 0

      // Smooth scale
      obj.mesh.scale.lerp(isHovered ? targetScaleHovered : targetScaleNormal, 0.12)

      // Hover ring: orbit + fade in/out
      if (isHovered) {
        obj.ring.position.copy(obj.mesh.position)
        obj.ring.rotation.x = time * 1.4
        obj.ring.rotation.y = time * 0.9
        obj.ringMat.opacity = Math.min(obj.ringMat.opacity + 0.08, 1)
        obj.ringMat.emissiveIntensity = 1.0 + 0.4 * Math.sin(time * 5)
      } else {
        obj.ringMat.opacity = Math.max(obj.ringMat.opacity - 0.06, 0)
      }
    }

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.mainScene, this.camera)
  }

  resize(width: number, height: number): void {
    this._height = height
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    // pickRT stays at logical pixels (pixel-ratio 1)
    this.pickRT.setSize(width, height)
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    for (const obj of this.objects) {
      obj.dispMat.dispose()
      obj.idMat.dispose()
      obj.ringMat.dispose()
    }
    this.pickRT.dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): THREE.Camera { return this.camera }
}
