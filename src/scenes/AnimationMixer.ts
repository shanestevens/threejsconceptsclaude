import * as THREE from 'three'
import type { SceneModule } from '../types'

export class AnimationMixerScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private mixer!: THREE.AnimationMixer
  private prevTime = 0

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)
    this.camera.position.set(0, 1, 5)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const dir = new THREE.DirectionalLight(0xffffff, 3.0)
    dir.position.set(5, 5, 5)
    this.scene.add(dir)

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.5
    this.scene.add(floor)

    // Bouncing sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3, metalness: 0.4 })
    )
    this.scene.add(sphere)

    // Shadow-like disc on floor
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -1.49
    this.scene.add(shadow)

    // Bounce KeyframeTrack — position Y
    const posTrack = new THREE.KeyframeTrack(
      '.position[y]',
      [0, 0.35, 0.4, 0.75, 0.8, 1.15, 1.2, 1.55, 1.6, 2.0],
      [-1, 1.2, -1, 0.8, -1, 0.4, -1, 0.1, -1, -1],
      THREE.InterpolateSmooth
    )

    // Squash on impact (scale Y)
    const scaleYTrack = new THREE.KeyframeTrack(
      '.scale[y]',
      [0, 0.35, 0.38, 0.42, 0.75, 0.78, 0.82, 1.15, 1.18, 1.22, 2.0],
      [1, 1, 0.45, 1, 1, 0.55, 1, 1, 0.7, 1, 1]
    )

    // Stretch on rise (scale X/Z squash when Y stretches)
    const scaleXTrack = new THREE.KeyframeTrack(
      '.scale[x]',
      [0, 0.35, 0.38, 0.42, 0.75, 0.78, 0.82, 2.0],
      [1, 1, 1.4, 1, 1, 1.3, 1, 1]
    )

    const clip = new THREE.AnimationClip('bounce', 2.0, [posTrack, scaleYTrack, scaleXTrack])
    this.mixer = new THREE.AnimationMixer(sphere)
    const action = this.mixer.clipAction(clip)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()

    // Second animated sphere for variety
    const sphere2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.3, metalness: 0.4 })
    )
    sphere2.position.x = 2
    this.scene.add(sphere2)

    const posTrack2 = new THREE.KeyframeTrack(
      '.position[y]', [0, 0.5, 1.0, 1.5, 2.0],
      [-1, 1.5, -1, 1.5, -1], THREE.InterpolateSmooth
    )
    const clip2 = new THREE.AnimationClip('bounce2', 2.0, [posTrack2])
    const action2 = this.mixer.clipAction(clip2, sphere2)
    action2.startAt(0.5).setLoop(THREE.LoopRepeat, Infinity).play()
  }

  update(time: number): void {
    const delta = time - this.prevTime
    this.prevTime = time
    this.mixer.update(delta)
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
