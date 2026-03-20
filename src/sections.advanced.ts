import type { Section } from './types'

export const advancedSections: Section[] = [
  {
    id: 'gpgpu',
    title: 'GPGPU Boids',
    subtitle: 'Ping-Pong Render Targets · Separation · Alignment · Cohesion',
    description:
      '<strong>GPGPU</strong> runs physics inside fragment shaders. 4,096 boids each store their position and velocity as texels in floating-point textures. Every frame, a <em>velocity shader</em> samples 64 neighbours, applies the three boid rules (separation, alignment, cohesion), and writes the new velocity into a second texture. A <em>position shader</em> then integrates the velocity. Zero CPU math — the GPU updates every boid in parallel.',
    tags: ['WebGLRenderTarget', 'FloatType', 'ping-pong', 'boids', 'DataTexture'],
    code: `// Four render targets: posA/posB + velA/velB (ping-pong pairs)
// Every frame alternates which pair is read vs written

// 1. Velocity pass — boid rules
velMat.uniforms.uPos.value   = posRead   // prev positions
velMat.uniforms.uVel.value   = velRead   // prev velocities
renderer.setRenderTarget(velWrite)
renderer.render(simScene, orthoCam)

// 2. Position pass — integrate
posMat.uniforms.uPos.value   = posRead
posMat.uniforms.uVel.value   = velWrite.texture  // just-computed
renderer.setRenderTarget(posWrite)
renderer.render(simScene, orthoCam)

// 3. Display — vertex shader reads position texture
boidMat.uniforms.uPos.value  = posWrite.texture
renderer.setRenderTarget(null)
renderer.render(scene, camera)

// Advance read pointers
posRead = posWrite.texture
velRead = velWrite.texture`,
  },
  {
    id: 'ray-marching',
    title: 'Ray Marching',
    subtitle: 'SDF · Sphere Tracing · GLSL',
    description:
      '<strong>Ray marching</strong> renders an entire scene in a single fragment shader — no meshes, no geometry. A ray is cast from the camera through each pixel. <strong>Signed Distance Functions (SDFs)</strong> describe shapes analytically: <code>sdSphere(p, r) = length(p) - r</code>. The ray steps forward by the SDF value (always safe) until it hits a surface. SDFs unlock smooth blending (<em>smin</em>), infinite repetition, and free ambient occlusion.',
    tags: ['SDF', 'ray marching', 'sdSphere', 'smin', 'ShaderMaterial', 'GLSL'],
    code: `float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}

// Smooth minimum — blends two surfaces
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float scene(vec3 p) {
  float s = sdSphere(p, 0.5);
  float t = sdTorus(p - vec3(0, 0.3, 0), vec2(0.8, 0.2));
  return smin(s, t, 0.3); // smoothly blend
}

// Sphere trace along ray rd from origin ro
float t = 0.0;
for (int i = 0; i < 80; i++) {
  float d = scene(ro + rd * t);
  if (d < 0.001) break;  // hit!
  t += d;                // safe step size = SDF value
}`,
  },
  {
    id: 'procedural-terrain',
    title: 'Procedural Terrain',
    subtitle: 'Vertex Shader · FBM Noise · Displacement',
    description:
      'Move terrain generation entirely onto the GPU. A <strong>vertex shader</strong> displaces the Y position of each vertex using <strong>Fractal Brownian Motion (FBM)</strong> — layered sine/cosine waves that produce natural-looking noise. Passing <code>uTime</code> as a uniform animates the terrain in real-time. The normal is also recomputed in the shader using the derivative of the displacement function.',
    tags: ['vertex shader', 'FBM', 'displacement', 'uTime', 'ShaderMaterial', 'varying'],
    code: `// FBM in GLSL — layered noise
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * (sin(p.x) * cos(p.y));
    p  *= 2.1;  // frequency doubles each octave
    a  *= 0.5;  // amplitude halves each octave
  }
  return v;
}

// Vertex shader displaces Y
void main() {
  vec3 pos = position;
  float h = fbm(pos.xz * 0.8 + uTime * 0.1);
  pos.y  += h * 1.5;
  vElevation = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`,
  },
  {
    id: 'hologram',
    title: 'Custom Material',
    subtitle: 'onBeforeCompile · Shader Injection',
    description:
      '<code>material.onBeforeCompile</code> intercepts Three.js\'s built-in GLSL before it compiles, letting you inject custom code into <strong>MeshStandardMaterial</strong> without rewriting it from scratch. Add uniforms, replace <code>#include</code> chunks, or append to <code>gl_FragColor</code>. This hologram effect adds scanlines, a Fresnel rim glow, and a flicker — all layered on top of the full PBR lighting pipeline.',
    tags: ['onBeforeCompile', 'ShaderChunk', 'uniform injection', 'Fresnel', 'MeshStandardMaterial'],
    code: `const mat = new THREE.MeshStandardMaterial({
  color: 0x00ffcc, transparent: true, side: THREE.DoubleSide
})

let shaderRef: THREE.WebGLProgramParametersWithUniforms

mat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 }
  shaderRef = shader

  // Inject at the end of the fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    \`#include <dithering_fragment>

    // Scanlines
    float line = step(0.5, fract(gl_FragCoord.y * 0.1 + uTime * 2.0));
    gl_FragColor.rgb *= 0.75 + 0.25 * line;

    // Fresnel rim
    // (vNormal + vViewDir injected in vertexShader similarly)
    gl_FragColor.rgb += fresnel * vec3(0.0, 1.0, 0.8);
    gl_FragColor.a   *= 0.7 + 0.3 * line;\`
  )
}`,
  },
  {
    id: 'cloth-sim',
    title: 'Cloth Simulation',
    subtitle: 'Verlet Integration · Constraint Solving',
    description:
      '<strong>Position-based dynamics</strong> using Verlet integration: velocity is implicit — derived from the difference between current and previous position. Each frame, apply gravity and wind forces, then run 5 iterations of <strong>constraint solving</strong> (Jakobsen method) to restore rest-length between adjacent particles. Pin the top row and the cloth hangs and waves naturally. All CPU, no physics library needed.',
    tags: ['Verlet', 'constraints', 'Jakobsen', 'BufferGeometry', 'computeVertexNormals'],
    code: `// Verlet step — no velocity storage needed
for (const p of particles) {
  if (p.pinned) continue
  const vel = p.pos.clone().sub(p.prev) // implicit velocity
  p.prev.copy(p.pos)
  p.pos.add(vel).add(gravity).add(wind)
}

// Constraint: restore rest-length between adjacent particles
function satisfy(pa, pb, restLen) {
  const delta = pb.pos.clone().sub(pa.pos)
  const diff  = (delta.length() - restLen) / delta.length()
  delta.multiplyScalar(diff * 0.5)
  if (!pa.pinned) pa.pos.add(delta)
  if (!pb.pinned) pb.pos.sub(delta)
}

// Run 5 iterations for stability
for (let i = 0; i < 5; i++) springs.forEach(satisfy)

// Upload to GPU
geo.attributes.position.needsUpdate = true
geo.computeVertexNormals()`,
  },
  {
    id: 'depth-buffer',
    title: 'Depth Buffer',
    subtitle: 'depthTexture · WebGLRenderTarget · Screen-space',
    description:
      'The <strong>depth buffer</strong> stores the linearised depth (0–1) of the closest fragment at each pixel. Attaching a <code>depthTexture</code> to a <strong>WebGLRenderTarget</strong> exposes it as a sampler in post-process shaders. Reading depth lets you compute world-space position from screen-space coordinates — enabling screen-space effects like contact fog, soft particles, and the outline effect shown here.',
    tags: ['depthTexture', 'WebGLRenderTarget', 'DepthFormat', 'screen-space', 'linearise'],
    code: `// Attach a depth texture to a render target
const depthTex = new THREE.DepthTexture(width, height)
depthTex.format = THREE.DepthFormat
depthTex.type   = THREE.UnsignedShortType

const rt = new THREE.WebGLRenderTarget(width, height, {
  depthTexture: depthTex,
  depthBuffer:  true,
})

// In a post-process shader, linearise depth:
// float z     = texture2D(tDepth, vUv).x;
// float near  = cameraNear, far = cameraFar;
// float linearZ = near / (far - z * (far - near));
// → 0 at near plane, 1 at far plane

// Use it for soft particle edges, fog, outlines...
// float edge = step(threshold, abs(sceneDepth - particleDepth))`,
  },
  {
    id: 'volumetric-light',
    title: 'Volumetric Light',
    subtitle: 'God Rays · Ray-marched Volume · Post-process',
    description:
      'Volumetric light (god rays) is a screen-space post-process that ray-marches from each pixel toward the light source, accumulating "fog density" along the way. The further a sample is from the light\'s screen-space position, the less it contributes. The accumulated glow is added on top of the colour buffer. This is the technique used in game engines for atmospheric light shafts.',
    tags: ['god rays', 'volumetric', 'screen-space', 'ray march', 'accumulation', 'post-process'],
    code: `// In the post-process fragment shader:
uniform sampler2D tDiffuse;
uniform vec2      uLightPos;   // light in screen space [0,1]
uniform float     uExposure;   // brightness
uniform int       uSamples;    // march steps (e.g. 60)

void main() {
  vec2 uv    = vUv;
  vec2 delta = (uv - uLightPos) / float(uSamples);
  float illumination = 0.0;

  for (int i = 0; i < 60; i++) {
    uv -= delta;
    float sample = texture2D(tDiffuse, uv).r;
    // Decay: samples near source contribute more
    illumination += sample * (1.0 - float(i) / 60.0);
  }
  illumination *= uExposure / 60.0;

  vec3 scene = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(scene + illumination * vec3(1,0.9,0.6), 1.0);
}`,
  },
  {
    id: 'gpu-picking',
    title: 'GPU Picking',
    subtitle: 'Color IDs · readPixels · Render Target',
    description:
      '<strong>GPU picking</strong> avoids CPU-side raycasting entirely. Each object is rendered with a unique flat colour (its ID encoded as RGB) into an off-screen render target. On mouse click, <code>renderer.readRenderTargetPixels()</code> reads the pixel under the cursor — decode the RGB back to an integer and you know exactly which object was clicked. Scales to millions of objects with no performance cost.',
    tags: ['readRenderTargetPixels', 'WebGLRenderTarget', 'color ID', 'picking', 'MeshBasicMaterial'],
    code: `// Assign each mesh a unique colour ID
meshes.forEach((mesh, i) => {
  const id = i + 1          // 0 = background
  const r  = (id >> 16) & 0xff
  const g  = (id >> 8)  & 0xff
  const b  =  id        & 0xff
  idMaterials[i] = new THREE.MeshBasicMaterial({
    color: new THREE.Color(r/255, g/255, b/255)
  })
})

// On click — render with ID materials into offscreen RT
meshes.forEach((m, i) => m.material = idMaterials[i])
renderer.setRenderTarget(pickRT)
renderer.render(scene, camera)
renderer.setRenderTarget(null)

// Read the pixel under the mouse
const buf = new Uint8Array(4)
renderer.readRenderTargetPixels(pickRT, mouseX, mouseY, 1, 1, buf)
const pickedId = (buf[0] << 16) | (buf[1] << 8) | buf[2]`,
  },
]
