import type { Section } from './types'

export const sections: Section[] = [
  {
    id: 'hello',
    title: 'Hello, Three.js',
    subtitle: 'Scene · Camera · Renderer',
    description:
      'Every Three.js experience is built from three primitives: a <strong>Scene</strong> that holds all objects, a <strong>Camera</strong> that defines the viewpoint, and a <strong>WebGLRenderer</strong> that draws everything onto a canvas. Add a BoxGeometry, wrap it in a Mesh, and you have your first 3D object.',
    tags: ['Scene', 'PerspectiveCamera', 'WebGLRenderer', 'BoxGeometry', 'Mesh'],
    code: `const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ canvas })

const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshBasicMaterial({ color: 0x6366f1 })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

function animate(t) {
  requestAnimationFrame(animate)
  cube.rotation.y = t * 0.001
  renderer.render(scene, camera)
}
animate()`,
  },
  {
    id: 'geometry',
    title: 'Geometry',
    subtitle: 'BufferGeometry · Primitives',
    description:
      'Geometry defines <strong>shape</strong>. Three.js ships with dozens of built-in primitives — spheres, toruses, cones, and more — all backed by <strong>BufferGeometry</strong>, which stores vertex data directly on the GPU for performance. You can also build fully custom meshes by populating position, normal, and uv attributes yourself.',
    tags: ['BufferGeometry', 'TetrahedronGeometry', 'SphereGeometry', 'TorusGeometry', 'ConeGeometry'],
    code: `// Built-in primitives
const sphere = new THREE.SphereGeometry(1, 32, 32)
const torus  = new THREE.TorusGeometry(0.6, 0.2, 16, 48)
const cone   = new THREE.ConeGeometry(0.7, 1.4, 6)

// Custom geometry via attributes
const geo = new THREE.BufferGeometry()
geo.setAttribute('position',
  new THREE.BufferAttribute(Float32Array.of(...), 3))`,
  },
  {
    id: 'materials',
    title: 'Materials',
    subtitle: 'Basic · Lambert · Phong · Standard',
    description:
      'Materials control how a surface <strong>responds to light</strong>. <strong>MeshBasicMaterial</strong> ignores lighting entirely. <strong>MeshLambertMaterial</strong> models diffuse-only surfaces. <strong>MeshPhongMaterial</strong> adds a specular highlight. <strong>MeshStandardMaterial</strong> uses physically-based rendering (PBR) with <em>metalness</em> and <em>roughness</em> for photorealistic results.',
    tags: ['MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial'],
    code: `// Physically-based (PBR) — the modern default
const mat = new THREE.MeshStandardMaterial({
  color:     0x6366f1,
  metalness: 0.3,   // 0 = plastic, 1 = metal
  roughness: 0.2,   // 0 = mirror, 1 = chalk
})

// Older Phong model — cheaper, not PBR
const phong = new THREE.MeshPhongMaterial({
  color:     0x6366f1,
  shininess: 120,
})`,
  },
  {
    id: 'lighting',
    title: 'Lighting',
    subtitle: 'Ambient · Point · Directional',
    description:
      'Lights are what bring <strong>depth and drama</strong> to a scene. <strong>AmbientLight</strong> fills the whole scene with flat colour. <strong>PointLight</strong> radiates in all directions from a single point, perfect for bulbs and candles. <strong>DirectionalLight</strong> simulates parallel rays from a distant source like the sun.',
    tags: ['AmbientLight', 'PointLight', 'DirectionalLight', 'SpotLight'],
    code: `// Fill the scene with soft ambient colour
scene.add(new THREE.AmbientLight(0x112233, 0.5))

// Point lights with colour and falloff radius
const red = new THREE.PointLight(0xec4899, 3, 8)
red.position.set(-2, 1, 2)
scene.add(red)

// Sun-like directional light
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(5, 10, 5)
scene.add(sun)`,
  },
  {
    id: 'shadows',
    title: 'Shadows',
    subtitle: 'Shadow Maps · PCF Soft Shadows',
    description:
      'Three.js implements shadows via <strong>shadow maps</strong>: the scene is rendered from the light\'s perspective into a depth texture, which is then compared during the main render pass. Enable <code>castShadow</code> and <code>receiveShadow</code> on objects, and set <code>renderer.shadowMap.enabled = true</code>. <strong>PCFSoftShadowMap</strong> blurs the edges for realism.',
    tags: ['shadowMap', 'castShadow', 'receiveShadow', 'PCFSoftShadowMap'],
    code: `renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const light = new THREE.DirectionalLight(0xffffff, 2)
light.castShadow = true
light.shadow.mapSize.set(2048, 2048)
light.shadow.bias = -0.001

sphere.castShadow    = true
floor.receiveShadow  = true`,
  },
  {
    id: 'particles',
    title: 'Particles',
    subtitle: 'Points · BufferGeometry · VertexColors',
    description:
      'A <strong>Points</strong> object renders one quad per vertex — massively efficient for particle systems. Positions are stored in a <strong>BufferAttribute</strong>, giving you direct control over thousands of particles. Pair with <code>vertexColors: true</code> to give each particle an individual colour from a colour buffer attribute.',
    tags: ['Points', 'PointsMaterial', 'BufferAttribute', 'vertexColors'],
    code: `const count = 3000
const positions = new Float32Array(count * 3)
const colors    = new Float32Array(count * 3)
// fill arrays ...

const geo = new THREE.BufferGeometry()
geo.setAttribute('position',
  new THREE.BufferAttribute(positions, 3))
geo.setAttribute('color',
  new THREE.BufferAttribute(colors, 3))

const mat = new THREE.PointsMaterial({
  size: 0.025, vertexColors: true,
})
scene.add(new THREE.Points(geo, mat))`,
  },
  {
    id: 'shaders',
    title: 'Shaders',
    subtitle: 'GLSL · ShaderMaterial · Uniforms',
    description:
      'At the heart of every material is a <strong>GLSL shader program</strong>. The <strong>vertex shader</strong> runs per-vertex and can deform geometry; the <strong>fragment shader</strong> runs per-pixel and controls colour. <strong>ShaderMaterial</strong> lets you write raw GLSL. Pass dynamic values — time, mouse position, resolution — via <strong>uniforms</strong>.',
    tags: ['ShaderMaterial', 'vertexShader', 'fragmentShader', 'uniforms', 'GLSL'],
    code: `const vertexShader = \`
  uniform float uTime;
  varying float vElevation;
  void main() {
    vec3 pos = position;
    float e = sin(pos.x * 3.0 + uTime) * 0.15;
    pos += normal * e;
    vElevation = e;
    gl_Position = projectionMatrix
      * modelViewMatrix * vec4(pos, 1.0);
  }
\`

const mat = new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  uniforms: { uTime: { value: 0 } },
})`,
  },
  {
    id: 'environment',
    title: 'Reflections',
    subtitle: 'CubeCamera · Environment Maps',
    description:
      'Real-time reflections use a <strong>CubeCamera</strong> that renders the scene into six faces of a cube texture. This <strong>environment map</strong> is then bound to a material\'s <code>envMap</code>, making surfaces like chrome or glass appear to reflect their surroundings. For static scenes, a pre-baked HDR texture is far cheaper.',
    tags: ['CubeCamera', 'CubeRenderTarget', 'envMap', 'MeshStandardMaterial'],
    code: `const envMap = new THREE.CubeRenderTarget(256, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
})
const cubeCamera = new THREE.CubeCamera(0.1, 50, envMap)
scene.add(cubeCamera)

const chromeMat = new THREE.MeshStandardMaterial({
  metalness: 1.0,
  roughness: 0.0,
  envMap:    envMap.texture,
})

// Each frame, re-render the env map
function animate() {
  object.visible = false
  cubeCamera.update(renderer, scene)
  object.visible = true
  renderer.render(scene, camera)
}`,
  },
  {
    id: 'instancing',
    title: 'Instancing',
    subtitle: 'InstancedMesh · One Draw Call',
    description:
      'Rendering 500 separate meshes costs 500 draw calls — a GPU bottleneck. <strong>InstancedMesh</strong> collapses them all into <strong>one</strong>. Each instance gets its own transform via <code>setMatrixAt()</code> using a <strong>Matrix4</strong>, and its own colour via <code>setColorAt()</code>. The result: 512 animated cubes at a fraction of the overhead.',
    tags: ['InstancedMesh', 'setMatrixAt', 'setColorAt', 'Matrix4', 'DynamicDrawUsage'],
    code: `const count = 512
const mesh = new THREE.InstancedMesh(geo, mat, count)
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

const dummy = new THREE.Object3D()
const color = new THREE.Color()

let idx = 0
for (let x = 0; x < 8; x++)
  for (let y = 0; y < 8; y++)
    for (let z = 0; z < 8; z++, idx++) {
      dummy.position.set(x - 3.5, y - 3.5, z - 3.5)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      mesh.setColorAt(idx, color.setHSL(idx / count, 0.9, 0.6))
    }

mesh.instanceMatrix.needsUpdate = true
mesh.instanceColor!.needsUpdate = true`,
  },
  {
    id: 'textures',
    title: 'Textures',
    subtitle: 'CanvasTexture · NormalMap · UV Mapping',
    description:
      'Textures map 2D images onto 3D surfaces using <strong>UV coordinates</strong> — per-vertex values in the [0,1] range that define which pixel of the texture corresponds to each point on the mesh. <strong>CanvasTexture</strong> lets you use a standard HTML Canvas as a texture source. <strong>NormalMap</strong> perturbs the lighting normals to fake surface detail without extra geometry.',
    tags: ['CanvasTexture', 'NormalMap', 'DataTexture', 'wrapS', 'wrapT', 'RepeatWrapping'],
    code: `// Procedural texture from an HTML Canvas
const texCanvas = document.createElement('canvas')
const ctx = texCanvas.getContext('2d')!
// ... draw on ctx ...
const texture = new THREE.CanvasTexture(texCanvas)
texture.wrapS = THREE.RepeatWrapping
texture.wrapT = THREE.RepeatWrapping
texture.repeat.set(2, 2)

const mat = new THREE.MeshStandardMaterial({
  map:       texture,
  normalMap: normalTexture,
  normalScale: new THREE.Vector2(0.5, 0.5),
})`,
  },
  {
    id: 'raycasting',
    title: 'Raycasting',
    subtitle: 'Raycaster · Mouse Picking · Intersection',
    description:
      'A <strong>Raycaster</strong> shoots a ray from camera through the mouse cursor into the scene and returns every object it hits — the foundation of all mouse interaction in Three.js. Convert the mouse position to <strong>Normalised Device Coordinates (NDC)</strong> in the range [-1, 1], pass them to <code>setFromCamera()</code>, then call <code>intersectObjects()</code>. <em>Hover over the spheres to see it in action.</em>',
    tags: ['Raycaster', 'intersectObjects', 'NDC', 'mousemove', 'Intersection'],
    code: `const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  // Convert to NDC: [-1, +1]
  mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
})

function update() {
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(meshes)
  hits.forEach(({ object }) => highlight(object))
}`,
  },
  {
    id: 'scenegraph',
    title: 'Scene Graph',
    subtitle: 'Group · Parent–Child · Transforms',
    description:
      'Three.js uses a <strong>tree of Objects</strong> — the scene graph. When you rotate a parent <strong>Group</strong>, all its children move with it. This makes complex hierarchical motion trivial: the <em>Earth</em> orbits the Sun because it lives inside a rotating Group; the <em>Moon</em> orbits Earth because it is a child of a Group at Earth\'s position. Transforms cascade down the hierarchy.',
    tags: ['Group', 'Object3D', 'add()', 'parent', 'updateMatrix'],
    code: `const solarSystem = new THREE.Group()
const earthOrbit  = new THREE.Group()

// Earth mesh at x=2.5 inside the orbit group
const earth = new THREE.Mesh(earthGeo, earthMat)
earth.position.x = 2.5
earthOrbit.add(earth)

// Moon group lives at Earth's x position
const moonOrbit = new THREE.Group()
moonOrbit.position.x = 2.5
const moon = new THREE.Mesh(moonGeo, moonMat)
moon.position.x = 0.65
moonOrbit.add(moon)
earthOrbit.add(moonOrbit)

solarSystem.add(earthOrbit)

// In animate():
earthOrbit.rotation.y = time * 0.5  // Earth orbits Sun
moonOrbit.rotation.y  = time * 2.2  // Moon orbits Earth`,
  },
  {
    id: 'curves',
    title: 'Curves & Tubes',
    subtitle: 'CatmullRomCurve3 · TubeGeometry · getPoint()',
    description:
      'Three.js has a full <strong>Curves</strong> system for defining smooth paths in 3D space. <strong>CatmullRomCurve3</strong> interpolates smoothly through a list of control points. Pass the curve to <strong>TubeGeometry</strong> to extrude a mesh along it, or call <code>curve.getPoint(t)</code> where <em>t ∈ [0,1]</em> to position objects at any point along the path — perfect for animations.',
    tags: ['CatmullRomCurve3', 'TubeGeometry', 'getPoint', 'getPoints', 'closed'],
    code: `const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.5,  0,  0),
  new THREE.Vector3( 0,    2, -2),
  new THREE.Vector3( 2.5,  0,  0),
  new THREE.Vector3( 0,   -2,  2),
], true) // closed loop

// Extrude a tube along the curve
const tube = new THREE.TubeGeometry(curve, 200, 0.04, 8, true)
scene.add(new THREE.Mesh(tube, material))

// Animate an object along the path
function update(time) {
  const t = (time * 0.1) % 1
  sphere.position.copy(curve.getPoint(t))
}`,
  },
  {
    id: 'fog',
    title: 'Fog',
    subtitle: 'FogExp2 · Atmospheric Depth',
    description:
      'Fog blends objects towards a <strong>background colour</strong> based on their distance from the camera — a cheap and effective way to add atmosphere and hide draw-distance pop-in. <strong>FogExp2</strong> uses exponential falloff (density²) for a more natural look than linear <code>Fog</code>. The background colour <em>must match</em> the fog colour for a seamless horizon.',
    tags: ['FogExp2', 'Fog', 'scene.fog', 'scene.background', 'density'],
    code: `// Exponential fog — denser at distance
const fogColor = 0x1a1f2e
scene.fog        = new THREE.FogExp2(fogColor, 0.10)
scene.background = new THREE.Color(fogColor) // must match!

// Linear fog — explicit near/far distances
scene.fog = new THREE.Fog(fogColor, 5, 30)

// Objects fade automatically — no shader changes needed
// MeshStandardMaterial, Lambert, Phong all respect fog
// MeshBasicMaterial does NOT`,
  },
]
