import type { Section } from './types'

export const intermediateSections: Section[] = [
  {
    id: 'animation-mixer',
    title: 'Animation Mixer',
    subtitle: 'AnimationMixer · KeyframeTrack · AnimationClip',
    description:
      'Three.js has a full <strong>timeline animation system</strong>. A <strong>KeyframeTrack</strong> defines values over time for a single property (position, rotation, scale, morph weight…). Bundle tracks into an <strong>AnimationClip</strong>, hand it to an <strong>AnimationMixer</strong>, and call <code>mixer.update(delta)</code> each frame. The mixer interpolates automatically — including easing via <em>InterpolateSmooth</em>.',
    tags: ['AnimationMixer', 'AnimationClip', 'KeyframeTrack', 'AnimationAction', 'InterpolateSmooth'],
    code: `// Define keyframes for bounce + squash/stretch
const posY = new THREE.KeyframeTrack(
  '.position[y]',
  [0, 0.4, 0.8],     // times (seconds)
  [-1, 1.5, -1],     // values
  THREE.InterpolateSmooth
)
const scaleY = new THREE.KeyframeTrack(
  '.scale[y]',
  [0, 0.38, 0.42, 0.8],
  [1,  1,   0.5,  1]
)

const clip   = new THREE.AnimationClip('bounce', 0.8, [posY, scaleY])
const mixer  = new THREE.AnimationMixer(mesh)
const action = mixer.clipAction(clip)
action.setLoop(THREE.LoopRepeat, Infinity).play()

// In animate():
const delta = clock.getDelta()
mixer.update(delta)`,
  },
  {
    id: 'morph-targets',
    title: 'Morph Targets',
    subtitle: 'morphAttributes · morphTargetInfluences',
    description:
      '<strong>Morph targets</strong> (blend shapes) let you interpolate between two vertex configurations on the GPU. Store an alternative set of positions in <code>geometry.morphAttributes.position</code>, then animate <code>mesh.morphTargetInfluences[0]</code> between 0 and 1. Three.js lerps between the base and target vertices in the vertex shader — no CPU work per frame.',
    tags: ['morphAttributes', 'morphTargetInfluences', 'Float32BufferAttribute', 'morph'],
    code: `const geo = new THREE.SphereGeometry(1, 64, 64)

// Build an alternative "spiked" vertex set
const base = geo.attributes.position
const morphPos = new Float32Array(base.count * 3)

for (let i = 0; i < base.count; i++) {
  const x = base.getX(i), y = base.getY(i), z = base.getZ(i)
  const spike = Math.abs(Math.sin(y * 6) * Math.cos(x * 5))
  morphPos[i*3]   = x * (1 + spike * 0.7)
  morphPos[i*3+1] = y * (1 + spike * 0.7)
  morphPos[i*3+2] = z * (1 + spike * 0.7)
}

geo.morphAttributes.position = [
  new THREE.Float32BufferAttribute(morphPos, 3)
]

const mesh = new THREE.Mesh(geo, material)
// Animate influence 0→1→0 in update():
mesh.morphTargetInfluences![0] = Math.sin(time) * 0.5 + 0.5`,
  },
  {
    id: 'render-target',
    title: 'Render Targets',
    subtitle: 'WebGLRenderTarget · Off-screen Rendering',
    description:
      'A <strong>WebGLRenderTarget</strong> is an off-screen framebuffer — instead of drawing to the canvas, you render into a texture. That texture can then be used as a <code>map</code> on any material: portals, security cameras, mirrors, post-processing chains. Swap <code>renderer.setRenderTarget(rt)</code> before rendering and <code>null</code> to restore the main canvas.',
    tags: ['WebGLRenderTarget', 'setRenderTarget', 'texture', 'framebuffer', 'portal'],
    code: `const rt = new THREE.WebGLRenderTarget(512, 512, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
})

// Inner scene rendered into the texture
const innerScene  = new THREE.Scene()
const innerCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)

// Screen mesh uses the rt texture as its material map
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 1.5),
  new THREE.MeshBasicMaterial({ map: rt.texture })
)

function animate() {
  // 1. Render inner scene → texture
  renderer.setRenderTarget(rt)
  renderer.render(innerScene, innerCamera)

  // 2. Render outer scene → canvas
  renderer.setRenderTarget(null)
  renderer.render(outerScene, camera)
}`,
  },
  {
    id: 'sprites',
    title: 'Sprites',
    subtitle: 'Sprite · SpriteMaterial · Billboard',
    description:
      'A <strong>Sprite</strong> is a quad that always faces the camera — a billboard. Unlike <code>Points</code>, each sprite is its own object with individual position and scale, making them easy to control. <strong>SpriteMaterial</strong> supports opacity, colour, and a texture map. They\'re ideal for particle effects, labels, lens flares, and HUD elements in 3D space.',
    tags: ['Sprite', 'SpriteMaterial', 'billboard', 'sizeAttenuation'],
    code: `// Draw a soft circle to use as the sprite texture
const canvas = document.createElement('canvas')
canvas.width = canvas.height = 64
const ctx = canvas.getContext('2d')!
const g = ctx.createRadialGradient(32,32,0, 32,32,32)
g.addColorStop(0,   'rgba(255,255,255,1)')
g.addColorStop(0.4, 'rgba(255,180,80,0.8)')
g.addColorStop(1,   'rgba(255,80,80,0)')
ctx.fillStyle = g
ctx.fillRect(0, 0, 64, 64)

const tex = new THREE.CanvasTexture(canvas)
const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })

for (let i = 0; i < 200; i++) {
  const sprite = new THREE.Sprite(mat)
  sprite.position.set(rx(), ry(), rz()) // random
  sprite.scale.setScalar(0.3 + Math.random() * 0.4)
  scene.add(sprite)
}`,
  },
  {
    id: 'lines',
    title: 'Lines & Graphs',
    subtitle: 'Line · LineDashedMaterial · LineSegments',
    description:
      '<strong>THREE.Line</strong> draws a continuous polyline through a set of vertices. <strong>THREE.LineSegments</strong> draws disconnected segment pairs. <strong>LineDashedMaterial</strong> adds a programmable dash pattern — call <code>geometry.computeLineDistances()</code> first to populate the attribute it reads. Together they power wireframes, graph edges, orbit rings, and debug helpers.',
    tags: ['Line', 'LineSegments', 'LineDashedMaterial', 'BufferGeometry', 'computeLineDistances'],
    code: `// Continuous line through points
const points = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0,  1, 0),
  new THREE.Vector3(1,  0, 0),
]
const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
const line = new THREE.Line(lineGeo,
  new THREE.LineBasicMaterial({ color: 0x6366f1 })
)

// Dashed line — must compute distances first!
lineGeo.computeLineDistances()
const dashed = new THREE.Line(lineGeo,
  new THREE.LineDashedMaterial({
    color: 0xec4899,
    dashSize: 0.15,
    gapSize:  0.08,
  })
)

// Disconnected segments (pairs of vertices)
const segGeo = new THREE.BufferGeometry().setFromPoints([a, b, c, d])
scene.add(new THREE.LineSegments(segGeo, mat))`,
  },
  {
    id: 'post-processing',
    title: 'Post-Processing',
    subtitle: 'EffectComposer · UnrealBloomPass · RenderPass',
    description:
      'Post-processing applies full-screen effects <em>after</em> the 3D scene is rendered. <strong>EffectComposer</strong> chains together <strong>Passes</strong>: a <strong>RenderPass</strong> draws the scene into an internal buffer, then subsequent passes read and transform that buffer. <strong>UnrealBloomPass</strong> adds HDR bloom — bright areas bleed light into neighbours, creating a physically-inspired glow.',
    tags: ['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass', 'Pass'],
    code: `import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }    from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass }    from 'three/examples/jsm/postprocessing/OutputPass.js'

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(width, height),
  1.2,   // strength
  0.5,   // radius
  0.4,   // threshold — only pixels brighter than this bloom
))
composer.addPass(new OutputPass())

// Replace renderer.render() with:
composer.render()

// On resize:
composer.setSize(width, height)`,
  },
  {
    id: 'custom-geometry',
    title: 'Custom Geometry',
    subtitle: 'BufferGeometry · position · normal · index',
    description:
      'Every Three.js primitive is just a <strong>BufferGeometry</strong> with typed array attributes. Build your own by populating <code>position</code>, <code>normal</code>, <code>uv</code>, and an <code>index</code> buffer. This terrain is a grid of vertices displaced by a sine-wave heightmap, with normals computed from cross-products of adjacent edges — the same technique used in real-time terrain engines.',
    tags: ['BufferGeometry', 'BufferAttribute', 'position', 'normal', 'index', 'computeVertexNormals'],
    code: `const res = 80  // grid resolution
const geo = new THREE.BufferGeometry()
const positions = new Float32Array(res * res * 3)
const indices: number[] = []

for (let z = 0; z < res; z++) {
  for (let x = 0; x < res; x++) {
    const i = (z * res + x) * 3
    const height = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.5
    positions[i]   = (x / (res-1) - 0.5) * 6
    positions[i+1] = height
    positions[i+2] = (z / (res-1) - 0.5) * 6

    if (x < res-1 && z < res-1) {
      const v = z*res + x
      indices.push(v, v+1, v+res, v+1, v+res+1, v+res)
    }
  }
}

geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
geo.setIndex(indices)
geo.computeVertexNormals() // auto-compute smooth normals`,
  },
  {
    id: 'pbr-workflow',
    title: 'PBR Texture Maps',
    subtitle: 'map · normalMap · roughnessMap · aoMap',
    description:
      'A PBR workflow layers multiple texture maps onto a single mesh: <strong>map</strong> (albedo/colour), <strong>normalMap</strong> (fake surface detail), <strong>roughnessMap</strong> (per-pixel roughness), <strong>metalnessMap</strong>, and <strong>aoMap</strong> (ambient occlusion). Each is a greyscale or RGB texture that drives a specific physical property — without adding a single extra polygon.',
    tags: ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'MeshStandardMaterial'],
    code: `// All maps can be canvas-generated or loaded
const mat = new THREE.MeshStandardMaterial({
  map:          albedoTexture,     // base colour
  normalMap:    normalTexture,     // fake bumps
  normalScale:  new THREE.Vector2(1, 1),
  roughnessMap: roughnessTexture,  // 0=mirror 1=chalk per pixel
  metalnessMap: metalnessTexture,  // 0=plastic 1=metal per pixel
  aoMap:        aoTexture,         // ambient occlusion
  aoMapIntensity: 1.0,
})

// aoMap needs a second UV set on the geometry
geometry.setAttribute('uv2',
  geometry.attributes.uv.clone()
)`,
  },
]
