import * as THREE from 'three'
import type { SceneModule } from '../types'

function buildCanvasTexture(): THREE.CanvasTexture {
  const size = 512
  const texCanvas = document.createElement('canvas')
  texCanvas.width = size
  texCanvas.height = size
  const ctx = texCanvas.getContext('2d')!

  const tileCount = 8
  const tileSize = size / tileCount
  const hues = [0, 30, 60, 120, 180, 210, 270, 320]

  for (let row = 0; row < tileCount; row++) {
    for (let col = 0; col < tileCount; col++) {
      const hue = hues[(row + col) % hues.length]
      const lightness = (row + col) % 2 === 0 ? '50%' : '35%'
      ctx.fillStyle = `hsl(${hue}, 85%, ${lightness})`
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize)

      // Contrasting dot in each tile
      const cx = col * tileSize + tileSize / 2
      const cy = row * tileSize + tileSize / 2
      ctx.fillStyle = `hsl(${(hue + 180) % 360}, 90%, 72%)`
      ctx.beginPath()
      ctx.arc(cx, cy, tileSize * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // UV grid lines for reference
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  for (let i = 0; i <= tileCount; i++) {
    ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(size, i * tileSize); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(texCanvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function buildCheckerNormal(): THREE.DataTexture {
  // Fake normal map — alternating up/right normals for a bumped checker look
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const idx = (i * size + j) * 4
      const checker = (Math.floor(i / 8) + Math.floor(j / 8)) % 2
      data[idx]     = checker ? 200 : 128  // R = x normal
      data[idx + 1] = checker ? 128 : 200  // G = y normal
      data[idx + 2] = 255                  // B = z normal (always up)
      data[idx + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

export class TexturesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private sphere!: THREE.Mesh
  private plane!: THREE.Mesh

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 5)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight.position.set(5, 5, 5)
    this.scene.add(dirLight)

    const colorTex   = buildCanvasTexture()
    const normalTex  = buildCheckerNormal()

    // Textured sphere on the left
    const sphereMat = new THREE.MeshStandardMaterial({
      map:       colorTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.6,
      metalness: 0.1,
    })
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 64), sphereMat)
    this.sphere.position.x = -1.3
    this.scene.add(this.sphere)

    // Flat plane on the right showing the raw texture (UV unwrap)
    const planeMat = new THREE.MeshBasicMaterial({ map: colorTex, side: THREE.DoubleSide })
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), planeMat)
    this.plane.position.x = 1.5
    this.scene.add(this.plane)
  }

  update(time: number): void {
    this.sphere.rotation.y = time * 0.4
    this.plane.rotation.y = Math.sin(time * 0.5) * 0.3
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
