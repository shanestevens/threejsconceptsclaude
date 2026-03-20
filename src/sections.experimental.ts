import type { Section } from './types'

export const experimentalSections: Section[] = [
  {
    id: 'fluid-sim',
    title: 'Navier-Stokes Fluid',
    subtitle: 'GPU Velocity Field · Pressure Solve · Dye Advection',
    description:
      '<strong>Real fluid simulation</strong> on the GPU using a 7-pass pipeline. Velocity is advected (semi-Lagrangian), mouse gestures inject vorticity and coloured dye, 25 iterations of Jacobi relaxation solve the pressure Poisson equation, and a gradient-subtract step enforces incompressibility — all at 256×256 resolution at 60 fps. Drag your mouse to swirl the fluid.',
    tags: ['Navier-Stokes', 'GPGPU', 'pressure-solve', 'advection', 'WebGLRenderTarget'],
    code: `// 7-pass fluid pipeline (each pass = fullscreen quad into an RT)

// 1. Advect velocity (semi-Lagrangian back-trace)
renderer.setRenderTarget(velWrite)
advectMat.uniforms.uVel.value = velRead.texture
renderer.render(quadScene, orthoCam)

// 2. Splat mouse force + dye
renderer.setRenderTarget(velWrite2)
splatMat.uniforms.uForce.value = mouseForce
renderer.render(quadScene, orthoCam)

// 3. Compute divergence
renderer.setRenderTarget(divRT)
divMat.uniforms.uVel.value = splatVelRT.texture
renderer.render(quadScene, orthoCam)

// 4. Jacobi pressure solve (×25 iterations)
for (let i = 0; i < 25; i++) {
  renderer.setRenderTarget(pressWrite)
  jacobiMat.uniforms.uPressure.value = pressRead.texture
  renderer.render(quadScene, orthoCam)
  swap(pressRead, pressWrite)
}

// 5. Subtract pressure gradient → divergence-free velocity
// 6. Advect dye through final velocity field
// 7. Display dye texture on screen`,
  },
  {
    id: 'path-tracer',
    title: 'Monte Carlo Path Tracer',
    subtitle: 'Global Illumination · Cornell Box · Progressive Refinement',
    description:
      '<strong>Path tracing</strong> simulates physically accurate light by casting rays that randomly scatter at surfaces. Each frame adds one new sample per pixel — a cosine-weighted hemisphere bounce off diffuse surfaces, specular reflection off the metal sphere, and refraction through the glass sphere. Samples accumulate in a <code>HalfFloatType</code> render target. Noise visibly drops as the sample count climbs. The Cornell box\'s red and green walls cast coloured light via indirect illumination.',
    tags: ['path-tracing', 'global-illumination', 'Monte-Carlo', 'GLSL', 'HalfFloatType'],
    code: `// Progressive path tracer — one sample per pixel per frame

// Trace pass: accumulate into floating-point RT
traceMat.uniforms.uAccum.value  = rtRead.texture
traceMat.uniforms.uSeed.value   = Math.random()
traceMat.uniforms.uSamples.value = sampleCount
renderer.setRenderTarget(rtWrite)
renderer.render(quadScene, orthoCam)
sampleCount++
swap(rtRead, rtWrite)

// Display pass: divide accumulated radiance by sample count
displayMat.uniforms.uAccum.value   = rtRead.texture
displayMat.uniforms.uSamples.value = sampleCount
renderer.setRenderTarget(null)
renderer.render(displayScene, orthoCam)

// Cornell box geometry (in GLSL):
// Ray-box intersections for 5 slabs, ray-sphere for two spheres
// Cosine-weighted hemisphere: d = normalize(N + randomUnitSphere())
// At each bounce: colour *= albedo, stop after depth 5 (Russian roulette)`,
  },
  {
    id: 'particle-life',
    title: 'Particle Life',
    subtitle: 'Emergent Behaviour · 5 Species · GPU N-Body',
    description:
      '<strong>Particle Life</strong> produces lifelike clustering and flocking from a single rule: each pair of particles has an attraction or repulsion coefficient that depends only on their species. 512 particles of 5 species interact on the GPU — for every particle, the force shader sums contributions from all 511 others in parallel. The 5×5 rule matrix is hand-tuned to produce stable orbiting clusters, chasing spirals, and fleeing swarms — all without any programmed "behaviour".',
    tags: ['emergent', 'GPGPU', 'N-body', 'ping-pong', 'instancing'],
    code: `// 5×5 species attraction matrix (positive = attract, negative = repel)
const RULES = [
  [ 0.5, -0.3,  0.2, -0.1,  0.4],   // red   ↔ others
  [ 0.2,  0.5, -0.4,  0.3, -0.2],   // yellow
  [-0.3,  0.1,  0.5, -0.2,  0.3],   // green
  [ 0.4, -0.2,  0.1,  0.5, -0.3],   // cyan
  [-0.1,  0.3, -0.2,  0.4,  0.5],   // purple
]

// GPU force accumulation (fragment shader, one texel = one particle):
vec2 force = vec2(0.0);
for (int j = 0; j < N; j++) {
  vec2 other = texelFetch(uPos, j).xy;
  vec2 delta = other - self;
  float dist = length(delta);
  float rule = getRuleCoeff(mySpecies, otherSpecies);
  // Repel close, attract at mid-range:
  if (dist < rMin) force -= normalize(delta) * 0.1;
  else if (dist < rMax) force += normalize(delta) * rule * (1.0 - dist/rMax);
}
velocity = velocity * 0.9 + force * dt;`,
  },
  {
    id: 'audio-visualizer',
    title: 'Audio Visualizer',
    subtitle: 'Web Audio API · FFT · Procedural Synth',
    description:
      '<strong>Web Audio API</strong> exposes the frequency spectrum via an <code>AnalyserNode</code> with a 256-point FFT. A procedural synth (bass oscillator + harmonic overtones) drives 128 frequency bins. Each bin maps to a bar arranged in a ring — taller bars for louder frequencies, red at low end shading to cyan at high. A central sphere pulses with the overall amplitude. The <code>getByteFrequencyData()</code> array is read every frame and used to set mesh scale.',
    tags: ['Web Audio API', 'AnalyserNode', 'FFT', 'OscillatorNode', 'instancing'],
    code: `// Web Audio setup
const ctx = new AudioContext()
const analyser = ctx.createAnalyser()
analyser.fftSize = 256                    // → 128 frequency bins

// Procedural synth: bass + harmonics
const bass = ctx.createOscillator()
bass.frequency.value = 80
bass.connect(analyser)
bass.start()

// Each frame: read FFT and drive bar heights
const data = new Uint8Array(128)
analyser.getByteFrequencyData(data)

for (let i = 0; i < 128; i++) {
  const h = (data[i] / 255) * 3 + 0.05
  // bars arranged in ring of radius 3
  const θ = (i / 128) * Math.PI * 2
  bar.position.set(Math.cos(θ) * 3, h / 2, Math.sin(θ) * 3)
  bar.scale.y = h
}

// Central sphere pulses with RMS amplitude
const avg = data.reduce((a, b) => a + b, 0) / data.length
sphere.scale.setScalar(0.8 + (avg / 255) * 0.6)`,
  },
  {
    id: 'game-of-life',
    title: 'GPU Game of Life',
    subtitle: "Conway's Rules · 512×512 Grid · 60 fps",
    description:
      "<strong>Conway's Game of Life</strong> at 512×512 resolution — 262,144 cells updated every frame entirely on the GPU. Each cell is a texel; the fragment shader samples the 8 Moore neighbours, counts live ones, and applies the classic rules: survive with 2 or 3 neighbours, born with exactly 3. Alive cells glow cyan; dead cells fade dark. The grid uses toroidal wrap-around. Click to randomise with a new seed.",
    tags: ["Conway's", 'GPGPU', 'ping-pong', 'DataTexture', 'fragment-shader'],
    code: `// Conway's rules in a fragment shader (one texel = one cell)
void main() {
  float alive = texture2D(uState, vUv).r;

  // Sample 8 Moore neighbours with wrap-around
  int neighbours = 0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      if (dx == 0 && dy == 0) continue;
      vec2 nb = fract(vUv + vec2(float(dx), float(dy)) * uTexel);
      if (texture2D(uState, nb).r > 0.5) neighbours++;
    }
  }

  // Survive: 2–3 neighbours; Born: exactly 3
  float next = 0.0;
  if (alive > 0.5 && (neighbours == 2 || neighbours == 3)) next = 1.0;
  if (alive < 0.5 &&  neighbours == 3)                     next = 1.0;

  gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
}

// Ping-pong: swap read/write RT each frame
// Display with glow shader: live=cyan(#00ffcc), dead=near-black`,
  },
]
