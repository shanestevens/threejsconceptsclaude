import * as THREE from 'three'
import type { SceneModule } from '../types'

const BAR_COUNT = 128
const RING_RADIUS = 3
const LIGHT_ORBIT_RADIUS = 5

export class AudioVisualizerScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera

  // Audio
  private audioCtx!: AudioContext
  private analyser!: AnalyserNode
  private dataArray!: Uint8Array<ArrayBuffer>
  private oscillators: OscillatorNode[] = []
  private gainNode!: GainNode

  // Visualization
  private barMeshes: THREE.Mesh[] = []
  private barMaterials: THREE.MeshStandardMaterial[] = []
  private centralSphere!: THREE.Mesh

  // Lights
  private pointLightRed!: THREE.PointLight
  private pointLightGreen!: THREE.PointLight
  private pointLightBlue!: THREE.PointLight

  private firstUpdate = true

  get orbitCamera(): THREE.Camera {
    return this.camera
  }

  init(canvas: HTMLCanvasElement): void {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x050510)
    this.scene.fog = new THREE.FogExp2(0x050510, 0.08)

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    )
    this.camera.position.set(0, 3, 8)
    this.camera.lookAt(0, 0, 0)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.15)
    this.scene.add(ambient)

    this.pointLightRed = new THREE.PointLight(0xff2244, 4, 15)
    this.pointLightGreen = new THREE.PointLight(0x22ff44, 4, 15)
    this.pointLightBlue = new THREE.PointLight(0x2244ff, 4, 15)

    this.scene.add(this.pointLightRed)
    this.scene.add(this.pointLightGreen)
    this.scene.add(this.pointLightBlue)

    // Floor disc (subtle glow plane)
    const floorGeo = new THREE.CircleGeometry(6, 64)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.9,
      metalness: 0.3,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.5
    floor.receiveShadow = true
    this.scene.add(floor)

    // Central sphere
    const sphereGeo = new THREE.SphereGeometry(0.8, 32, 32)
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.8,
    })
    this.centralSphere = new THREE.Mesh(sphereGeo, sphereMat)
    this.centralSphere.castShadow = true
    this.scene.add(this.centralSphere)

    // Frequency bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / BAR_COUNT // 0..1
      const angle = (i / BAR_COUNT) * Math.PI * 2

      const x = Math.cos(angle) * RING_RADIUS
      const z = Math.sin(angle) * RING_RADIUS

      const geo = new THREE.BoxGeometry(0.15, 1, 0.15)
      // Shift geometry so bottom is at y=0 (pivot at bottom)
      geo.translate(0, 0.5, 0)

      // Color by frequency: low=red/orange, mid=green, high=blue/cyan
      const color = freqColor(t)
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.5,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, -0.5, z)
      // Rotate bar to face outward (optional, looks good)
      mesh.rotation.y = -angle
      mesh.castShadow = true
      this.scene.add(mesh)

      this.barMeshes.push(mesh)
      this.barMaterials.push(mat)
    }

    // Audio setup
    this.setupAudio()
  }

  private setupAudio(): void {
    this.audioCtx = new AudioContext()

    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount)) // 128

    this.gainNode = this.audioCtx.createGain()
    this.gainNode.gain.value = 0.08

    // Bass oscillator: 80Hz sine
    const bass = this.createOscillator('sine', 80)
    const bassGain = this.audioCtx.createGain()
    bassGain.gain.value = 1.0
    bass.connect(bassGain)
    bassGain.connect(this.gainNode)

    // Sub-bass: 40Hz
    const sub = this.createOscillator('sine', 40)
    const subGain = this.audioCtx.createGain()
    subGain.gain.value = 0.6
    sub.connect(subGain)
    subGain.connect(this.gainNode)

    // Harmonic at 160Hz (sawtooth for richness)
    const harm1 = this.createOscillator('sawtooth', 160)
    const harm1Gain = this.audioCtx.createGain()
    harm1Gain.gain.value = 0.3
    harm1.connect(harm1Gain)
    harm1Gain.connect(this.gainNode)

    // Harmonic at 320Hz
    const harm2 = this.createOscillator('square', 320)
    const harm2Gain = this.audioCtx.createGain()
    harm2Gain.gain.value = 0.15
    harm2.connect(harm2Gain)
    harm2Gain.connect(this.gainNode)

    // High shimmer: 640Hz triangle
    const shimmer = this.createOscillator('triangle', 640)
    const shimmerGain = this.audioCtx.createGain()
    shimmerGain.gain.value = 0.08
    shimmer.connect(shimmerGain)
    shimmerGain.connect(this.gainNode)

    // Second shimmer: 1280Hz
    const shimmer2 = this.createOscillator('triangle', 1280)
    const shimmer2Gain = this.audioCtx.createGain()
    shimmer2Gain.gain.value = 0.04
    shimmer2.connect(shimmer2Gain)
    shimmer2Gain.connect(this.gainNode)

    this.gainNode.connect(this.analyser)
    this.analyser.connect(this.audioCtx.destination)

    // Try to start all oscillators
    for (const osc of this.oscillators) {
      try {
        osc.start()
      } catch {
        // Already started or context not ready
      }
    }
  }

  private createOscillator(type: OscillatorType, frequency: number): OscillatorNode {
    const osc = this.audioCtx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency
    this.oscillators.push(osc)
    return osc
  }

  update(time: number): void {
    // Handle autoplay policy: resume audio context on first update
    if (this.firstUpdate) {
      this.firstUpdate = false
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {
          // Will retry next frame naturally
        })
      }
    } else if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }

    // Get FFT data
    this.analyser.getByteFrequencyData(this.dataArray)

    // Compute average amplitude for sphere pulse
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i]
    }
    const avg = sum / this.dataArray.length
    const normalizedAvg = avg / 255

    // Pulse central sphere
    const sphereScale = 0.9 + normalizedAvg * 0.8
    this.centralSphere.scale.setScalar(sphereScale)

    // Update emissive intensity of sphere based on amplitude
    const sphereMat = this.centralSphere.material as THREE.MeshStandardMaterial
    sphereMat.emissiveIntensity = 0.2 + normalizedAvg * 1.2

    // Update bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const value = this.dataArray[i]
      const scaleY = (value / 255) * 3 + 0.05
      this.barMeshes[i].scale.y = scaleY

      // Update emissive intensity with amplitude
      const normalizedVal = value / 255
      this.barMaterials[i].emissiveIntensity = 0.2 + normalizedVal * 0.8
    }

    // Slowly rotate camera around scene
    const cameraAngle = time * 0.12
    const cameraRadius = 8
    const cameraHeight = 2.5 + Math.sin(time * 0.07) * 1.0
    this.camera.position.set(
      Math.cos(cameraAngle) * cameraRadius,
      cameraHeight,
      Math.sin(cameraAngle) * cameraRadius
    )
    this.camera.lookAt(0, 0, 0)

    // Orbit the 3 colored point lights
    const lr = LIGHT_ORBIT_RADIUS
    this.pointLightRed.position.set(
      Math.cos(time * 0.5) * lr,
      2 + Math.sin(time * 0.3) * 1.5,
      Math.sin(time * 0.5) * lr
    )
    this.pointLightGreen.position.set(
      Math.cos(time * 0.5 + (Math.PI * 2) / 3) * lr,
      2 + Math.sin(time * 0.3 + 1.0) * 1.5,
      Math.sin(time * 0.5 + (Math.PI * 2) / 3) * lr
    )
    this.pointLightBlue.position.set(
      Math.cos(time * 0.5 + (Math.PI * 4) / 3) * lr,
      2 + Math.sin(time * 0.3 + 2.0) * 1.5,
      Math.sin(time * 0.5 + (Math.PI * 4) / 3) * lr
    )

    // Modulate light intensity with amplitude
    const lightIntensity = 3 + normalizedAvg * 6
    this.pointLightRed.intensity = lightIntensity
    this.pointLightGreen.intensity = lightIntensity
    this.pointLightBlue.intensity = lightIntensity

    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  destroy(): void {
    // Stop oscillators
    for (const osc of this.oscillators) {
      try {
        osc.stop()
      } catch {
        // May already be stopped
      }
    }
    this.oscillators = []

    // Close audio context
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {})
    }

    // Dispose Three.js resources
    for (let i = 0; i < this.barMeshes.length; i++) {
      this.barMeshes[i].geometry.dispose()
      this.barMaterials[i].dispose()
      this.scene.remove(this.barMeshes[i])
    }
    this.barMeshes = []
    this.barMaterials = []

    if (this.centralSphere) {
      this.centralSphere.geometry.dispose()
      ;(this.centralSphere.material as THREE.MeshStandardMaterial).dispose()
    }

    this.renderer.dispose()
  }
}

/**
 * Map a normalized frequency position (0=low, 1=high) to a THREE.Color.
 * Low  → red/orange
 * Mid  → green/yellow
 * High → blue/cyan
 */
function freqColor(t: number): THREE.Color {
  if (t < 0.33) {
    // red → orange → yellow
    const s = t / 0.33
    return new THREE.Color().setHSL(0.05 - s * 0.05, 1.0, 0.55)
  } else if (t < 0.66) {
    // yellow → green
    const s = (t - 0.33) / 0.33
    return new THREE.Color().setHSL(0.12 + s * 0.2, 1.0, 0.5)
  } else {
    // green → cyan → blue
    const s = (t - 0.66) / 0.34
    return new THREE.Color().setHSL(0.45 + s * 0.2, 1.0, 0.55)
  }
}
