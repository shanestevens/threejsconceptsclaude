import * as THREE from 'three'
import type { SceneModule } from '../types'

export class LinesScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private group!: THREE.Group

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 7)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.group = new THREE.Group()
    this.scene.add(this.group)

    // Generate a constellation of nodes on a sphere surface
    const nodeCount = 40
    const nodes: THREE.Vector3[] = []
    for (let i = 0; i < nodeCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.5
      nodes.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ))
    }

    // Connect nearby nodes with lines
    const edgePoints: THREE.Vector3[] = []
    const dashedPoints: THREE.Vector3[] = []
    const threshold = 2.0
    const dashedThreshold = 3.0

    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodes[i].distanceTo(nodes[j])
        if (dist < threshold) {
          edgePoints.push(nodes[i], nodes[j])
        } else if (dist < dashedThreshold) {
          dashedPoints.push(nodes[i], nodes[j])
        }
      }
    }

    // Solid lines — short connections
    const solidGeo = new THREE.BufferGeometry().setFromPoints(edgePoints)
    const solidMat = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8 })
    this.group.add(new THREE.LineSegments(solidGeo, solidMat))

    // Dashed lines — longer connections (computeLineDistances lives on Line, not geometry)
    const dashedGeo = new THREE.BufferGeometry().setFromPoints(dashedPoints)
    const dashedMat = new THREE.LineDashedMaterial({
      color: 0xec4899,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.5,
    })
    const dashedLine = new THREE.LineSegments(dashedGeo, dashedMat)
    dashedLine.computeLineDistances()
    this.group.add(dashedLine)

    // Node spheres
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0xa5b4fc })
    const nodeGeo = new THREE.SphereGeometry(0.05, 8, 8)
    nodes.forEach((pos) => {
      const node = new THREE.Mesh(nodeGeo, nodeMat)
      node.position.copy(pos)
      this.group.add(node)
    })

    // Orbit path ring around the sphere
    const ringPoints: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      ringPoints.push(new THREE.Vector3(Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0))
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints)
    const ringMat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.4 })
    this.group.add(new THREE.Line(ringGeo, ringMat))
  }

  update(time: number): void {
    this.group.rotation.y = time * 0.15
    this.group.rotation.x = time * 0.05
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
