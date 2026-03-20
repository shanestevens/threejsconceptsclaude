import * as THREE from 'three'
import type { SceneModule } from '../types'

interface RadarBlip {
  angle: number
  radius: number
  opacity: number
}

export class CanvasTextureScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera

  // Oscilloscope cube
  private cube!: THREE.Mesh
  private oscCanvas!: HTMLCanvasElement
  private oscCtx!: CanvasRenderingContext2D
  private oscTex!: THREE.CanvasTexture

  // Radar sphere
  private sphere!: THREE.Mesh
  private radarCanvas!: HTMLCanvasElement
  private radarCtx!: CanvasRenderingContext2D
  private radarTex!: THREE.CanvasTexture
  private radarBlips: RadarBlip[] = []

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 6)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambient)

    // Warm directional from front-right
    const warmLight = new THREE.DirectionalLight(0xffddaa, 1.2)
    warmLight.position.set(4, 3, 5)
    this.scene.add(warmLight)

    // Cool directional from back-left
    const coolLight = new THREE.DirectionalLight(0xaaccff, 0.8)
    coolLight.position.set(-4, -2, -4)
    this.scene.add(coolLight)

    // --- Oscilloscope canvas (256x256) ---
    this.oscCanvas = document.createElement('canvas')
    this.oscCanvas.width = this.oscCanvas.height = 256
    this.oscCtx = this.oscCanvas.getContext('2d')!
    this.oscTex = new THREE.CanvasTexture(this.oscCanvas)

    const cubeMat = new THREE.MeshStandardMaterial({ map: this.oscTex })
    const cubeGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8)
    this.cube = new THREE.Mesh(cubeGeo, cubeMat)
    this.cube.position.set(-1.0, 0, 0)
    this.scene.add(this.cube)

    // --- Radar canvas (256x256) ---
    this.radarCanvas = document.createElement('canvas')
    this.radarCanvas.width = this.radarCanvas.height = 256
    this.radarCtx = this.radarCanvas.getContext('2d')!
    this.radarTex = new THREE.CanvasTexture(this.radarCanvas)

    const sphereMat = new THREE.MeshStandardMaterial({ map: this.radarTex })
    const sphereGeo = new THREE.SphereGeometry(1.2, 32, 32)
    this.sphere = new THREE.Mesh(sphereGeo, sphereMat)
    this.sphere.position.set(2.8, 0, -1.5)
    this.scene.add(this.sphere)

    // Seed some radar blips
    for (let i = 0; i < 12; i++) {
      this.radarBlips.push({
        angle: Math.random() * Math.PI * 2,
        radius: 20 + Math.random() * 90,
        opacity: 0,
      })
    }
  }

  private drawOscilloscope(time: number): void {
    const ctx = this.oscCtx
    const W = 256, H = 256

    // Background
    ctx.fillStyle = '#020a02'
    ctx.fillRect(0, 0, W, H)

    // Grid lines — neon green, low opacity
    ctx.strokeStyle = 'rgba(0, 255, 60, 0.18)'
    ctx.lineWidth = 1
    const gridStep = 32
    for (let x = 0; x <= W; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y <= H; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Three overlapping sine waves
    const waves: { color: string; amplitude: number; frequency: number; phase: number; lineWidth: number }[] = [
      { color: 'rgba(0, 255, 80, 0.85)',  amplitude: 50, frequency: 2.1, phase: 0,            lineWidth: 2 },
      { color: 'rgba(60, 255, 120, 0.55)', amplitude: 35, frequency: 3.7, phase: Math.PI / 3, lineWidth: 1.5 },
      { color: 'rgba(0, 200, 50, 0.40)',   amplitude: 65, frequency: 1.3, phase: Math.PI,     lineWidth: 1 },
    ]

    const cy = H / 2

    for (const w of waves) {
      ctx.beginPath()
      ctx.strokeStyle = w.color
      ctx.lineWidth = w.lineWidth

      for (let px = 0; px < W; px++) {
        const t = (px / W) * Math.PI * 2 * w.frequency + time * 1.8 + w.phase
        const py = cy + Math.sin(t) * w.amplitude * (0.8 + 0.2 * Math.sin(time * 0.7 + w.phase))
        if (px === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    this.oscTex.needsUpdate = true
  }

  private drawRadar(time: number): void {
    const ctx = this.radarCtx
    const W = 256, H = 256
    const cx = W / 2, cy = H / 2
    const maxR = 110

    // Background
    ctx.fillStyle = '#010d01'
    ctx.fillRect(0, 0, W, H)

    // Concentric circles
    ctx.strokeStyle = 'rgba(0, 220, 60, 0.30)'
    ctx.lineWidth = 1
    for (let r = maxR / 4; r <= maxR; r += maxR / 4) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Cross hairs
    ctx.strokeStyle = 'rgba(0, 220, 60, 0.20)'
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke()

    // Sweep line — rotating, leaves a fading arc trail
    const sweepAngle = (time * 1.4) % (Math.PI * 2)

    // Draw fading sweep sector
    const sectorSteps = 24
    for (let s = 0; s < sectorSteps; s++) {
      const frac = s / sectorSteps
      const a = sweepAngle - frac * (Math.PI * 0.55)
      const alpha = (1 - frac) * 0.22
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, maxR, a - 0.07, a + 0.07)
      ctx.closePath()
      ctx.fillStyle = `rgba(0, 255, 80, ${alpha})`
      ctx.fill()
    }

    // Bright sweep line
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR)
    ctx.stroke()

    // Update blip opacity: a blip lights up when sweep passes its angle
    for (const blip of this.radarBlips) {
      const diff = ((sweepAngle - blip.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
      if (diff < 0.12) {
        blip.opacity = 1.0
      } else {
        blip.opacity = Math.max(0, blip.opacity - 0.008)
      }
    }

    // Draw blips
    for (const blip of this.radarBlips) {
      if (blip.opacity <= 0) continue
      const bx = cx + Math.cos(blip.angle) * blip.radius
      const by = cy + Math.sin(blip.angle) * blip.radius
      ctx.beginPath()
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(120, 255, 140, ${blip.opacity})`
      ctx.fill()
    }

    this.radarTex.needsUpdate = true
  }

  update(time: number): void {
    // Spin the cube
    this.cube.rotation.y = time * 0.4
    this.cube.rotation.x = time * 0.15

    // Slowly rotate the sphere too so all sides are visible
    this.sphere.rotation.y = time * 0.25

    // Redraw canvases
    this.drawOscilloscope(time)
    this.drawRadar(time)

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
