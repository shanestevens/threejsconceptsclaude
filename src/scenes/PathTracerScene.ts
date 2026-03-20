import * as THREE from 'three'
import type { SceneModule } from '../types'

const VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

// ---------------------------------------------------------------------------
// Path-tracing fragment shader
// ---------------------------------------------------------------------------
const TRACE_FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform int   uFrame;
uniform sampler2D uPrevAccum;
uniform int   uSamples;

// ---- RNG ------------------------------------------------------------------
// Hash-based RNG seeded from pixel + frame
uint hash(uint x) {
  x += (x << 10u);
  x ^= (x >>  6u);
  x += (x <<  3u);
  x ^= (x >> 11u);
  x += (x << 15u);
  return x;
}

uint hash2(uint a, uint b) {
  return hash(a ^ hash(b));
}

float floatFromBits(uint m) {
  return uintBitsToFloat((m & 0x007FFFFFu) | 0x3F800000u) - 1.0;
}

// Per-invocation mutable seed
uint gSeed;

float rand() {
  gSeed = hash(gSeed);
  return floatFromBits(gSeed);
}

// ---- Math helpers ---------------------------------------------------------
const float PI  = 3.14159265358979;
const float INF = 1e30;
const float EPS = 1e-4;

struct Ray { vec3 o; vec3 d; };

// ---- Cosine-weighted hemisphere sampling ----------------------------------
vec3 cosineHemi(vec3 n) {
  float r1 = rand();
  float r2 = rand();
  float phi = 2.0 * PI * r1;
  float sqr2 = sqrt(r2);
  float x = cos(phi) * sqr2;
  float y = sin(phi) * sqr2;
  float z = sqrt(1.0 - r2);

  // Build ONB around n
  vec3 up = abs(n.y) < 0.999 ? vec3(0,1,0) : vec3(1,0,0);
  vec3 t  = normalize(cross(up, n));
  vec3 b  = cross(n, t);
  return normalize(t * x + b * y + n * z);
}

// ---- Schlick Fresnel ------------------------------------------------------
float schlick(float cosTheta, float ior) {
  float r0 = (1.0 - ior) / (1.0 + ior);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
}

// ---- Intersection structs -------------------------------------------------
struct Hit {
  float t;
  vec3  n;       // surface normal (outward)
  vec3  albedo;
  float emission;
  int   mat;     // 0=diffuse, 1=metal, 2=glass
};

Hit noHit() {
  Hit h;
  h.t = INF;
  h.n = vec3(0);
  h.albedo = vec3(0);
  h.emission = 0.0;
  h.mat = 0;
  return h;
}

// ---- Ray-AABB intersection ------------------------------------------------
// Returns entry t (negative means ray starts inside)
float rayBox(Ray r, vec3 mn, vec3 mx, out vec3 normal) {
  vec3 invD = 1.0 / r.d;
  vec3 t0 = (mn - r.o) * invD;
  vec3 t1 = (mx - r.o) * invD;
  vec3 tMin = min(t0, t1);
  vec3 tMax = max(t0, t1);
  float tNear = max(max(tMin.x, tMin.y), tMin.z);
  float tFar  = min(min(tMax.x, tMax.y), tMax.z);
  if (tNear > tFar || tFar < EPS) return INF;
  float t = tNear > EPS ? tNear : tFar;
  // Compute normal of hit face
  vec3 p = r.o + t * r.d;
  vec3 c = (mn + mx) * 0.5;
  vec3 d = (mx - mn) * 0.5;
  vec3 q = (p - c) / d;
  float ax = abs(q.x), ay = abs(q.y), az = abs(q.z);
  if (ax > ay && ax > az) normal = vec3(sign(q.x), 0, 0);
  else if (ay > az)       normal = vec3(0, sign(q.y), 0);
  else                    normal = vec3(0, 0, sign(q.z));
  return t;
}

// ---- Ray-sphere intersection ----------------------------------------------
float raySphere(Ray r, vec3 center, float radius, out vec3 normal) {
  vec3 oc = r.o - center;
  float b = dot(oc, r.d);
  float c = dot(oc, oc) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return INF;
  float sq = sqrt(disc);
  float t = -b - sq;
  if (t < EPS) t = -b + sq;
  if (t < EPS) return INF;
  normal = normalize(r.o + t * r.d - center);
  return t;
}

// ---- Cornell box scene ----------------------------------------------------
// Box: x[-1,1]  y[0,2]  z[-1,1]   camera at z=3 looking -z
//
// We model the box as individual AABB slabs so each wall has its own albedo.

Hit intersectScene(Ray r) {
  Hit best = noHit();

  vec3 n;
  float t;

  // -- Floor (white)
  t = rayBox(r, vec3(-1.0, -0.001, -1.0), vec3(1.0, 0.001, 1.0), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.73);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Ceiling (white)
  t = rayBox(r, vec3(-1.0, 1.999, -1.0), vec3(1.0, 2.001, 1.0), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.73);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Back wall (white)
  t = rayBox(r, vec3(-1.0, 0.0, -1.001), vec3(1.0, 2.0, -0.999), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.73);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Left wall (red)
  t = rayBox(r, vec3(-1.001, 0.0, -1.0), vec3(-0.999, 2.0, 1.0), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.65, 0.05, 0.05);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Right wall (green)
  t = rayBox(r, vec3(0.999, 0.0, -1.0), vec3(1.001, 2.0, 1.0), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.12, 0.45, 0.15);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Area light panel on ceiling (emissive white box)
  t = rayBox(r, vec3(-0.35, 1.96, -0.35), vec3(0.35, 2.0, 0.35), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(1.0);
    best.emission = 15.0; best.mat = 0;
  }

  // -- Tall box (diffuse white) - left of center
  t = rayBox(r, vec3(-0.6, 0.0, -0.7), vec3(-0.05, 1.2, -0.15), n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.73);
    best.emission = 0.0; best.mat = 0;
  }

  // -- Metal sphere - right side
  t = raySphere(r, vec3(0.42, 0.32, -0.3), 0.32, n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(0.95, 0.85, 0.7); // gold-ish
    best.emission = 0.0; best.mat = 1;   // metallic
  }

  // -- Glass sphere - center-left low
  t = raySphere(r, vec3(-0.2, 0.26, 0.25), 0.26, n);
  if (t < best.t) {
    best.t = t; best.n = n;
    best.albedo = vec3(1.0);
    best.emission = 0.0; best.mat = 2;   // glass
  }

  return best;
}

// ---- Path trace -----------------------------------------------------------
vec3 pathTrace(Ray ray) {
  vec3 throughput = vec3(1.0);
  vec3 radiance   = vec3(0.0);

  for (int bounce = 0; bounce < 8; bounce++) {
    Hit h = intersectScene(ray);
    if (h.t >= INF) {
      // Sky / background (none - box is closed)
      break;
    }

    vec3 hitP = ray.o + h.t * ray.d;

    // Ensure normal faces the incoming ray
    bool entering = dot(ray.d, h.n) < 0.0;
    vec3 faceN    = entering ? h.n : -h.n;

    // Emission
    radiance += throughput * h.albedo * h.emission;

    // Russian roulette after bounce 4
    if (bounce >= 4) {
      float survive = max(max(throughput.x, throughput.y), throughput.z);
      survive = min(survive, 0.95);
      if (rand() > survive) break;
      throughput /= survive;
    }

    // --- Material BRDF / BTDF scatter ---
    if (h.mat == 0) {
      // Lambertian diffuse
      vec3 newDir = cosineHemi(faceN);
      throughput  *= h.albedo; // pdf cancels with cos/pi in cosine-weighted
      ray = Ray(hitP + faceN * EPS, newDir);

    } else if (h.mat == 1) {
      // Metallic (near-perfect mirror with slight roughness)
      float roughness = 0.04;
      vec3 reflected  = reflect(ray.d, faceN);
      // Perturb slightly
      vec3 fuzzDir    = cosineHemi(reflected);
      vec3 newDir     = normalize(mix(reflected, fuzzDir, roughness));
      throughput      *= h.albedo;
      ray = Ray(hitP + faceN * EPS, newDir);

    } else {
      // Glass (dielectric)
      float ior     = entering ? (1.0 / 1.5) : 1.5;
      float cosI    = -dot(ray.d, faceN);
      float fresnelR = schlick(cosI, ior);

      vec3 newDir;
      if (rand() < fresnelR) {
        // Reflect
        newDir = reflect(ray.d, faceN);
        ray    = Ray(hitP + faceN * EPS, newDir);
      } else {
        // Refract
        newDir = refract(ray.d, faceN, ior);
        if (length(newDir) < 0.5) {
          // Total internal reflection fallback
          newDir = reflect(ray.d, faceN);
          ray    = Ray(hitP + faceN * EPS, newDir);
        } else {
          ray = Ray(hitP - faceN * EPS, newDir);
        }
      }
      // throughput unchanged (glass has no albedo absorption here)
    }
  }

  return radiance;
}

// ---- Camera ---------------------------------------------------------------
Ray makeRay(vec2 uv) {
  // Camera at z=3, looking toward -z into the Cornell box
  // Box spans x[-1,1] y[0,2] z[-1,1]
  vec3 origin = vec3(0.0, 1.0, 3.0);
  float fov   = 0.5; // half-tan of ~26 degrees gives a tight framing
  vec2 jitter = vec2(rand(), rand()) - 0.5; // sub-pixel jitter
  vec2 ndc    = (gl_FragCoord.xy + jitter) / uResolution * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  vec3 dir    = normalize(vec3(ndc.x * aspect * fov, ndc.y * fov, -1.0));
  return Ray(origin, dir);
}

void main() {
  // Seed RNG with pixel coords + frame
  uvec2 px = uvec2(gl_FragCoord.xy);
  gSeed = hash2(px.x + uint(uFrame) * 1973u, px.y + uint(uFrame) * 9277u);
  gSeed = hash(gSeed ^ uint(uFrame * 6271));

  Ray ray = makeRay(vUv);
  vec3 color = pathTrace(ray);

  // Accumulate: add new sample to previous buffer
  vec3 prev = texture2D(uPrevAccum, vUv).rgb;
  gl_FragColor = vec4(prev + color, 1.0);
}
`

// ---------------------------------------------------------------------------
// Display pass: average accumulated samples
// ---------------------------------------------------------------------------
const DISPLAY_FRAG = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uAccum;
uniform int       uSamples;

// Simple ACES tone-map
vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

void main() {
  vec3 accum = texture2D(uAccum, vUv).rgb;
  vec3 color = accum / float(max(uSamples, 1));
  color = aces(color);
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  gl_FragColor = vec4(color, 1.0);
}
`

export class PathTracerScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private quad!: THREE.Mesh
  private traceMat!: THREE.ShaderMaterial
  private displayMat!: THREE.ShaderMaterial
  private rtA!: THREE.WebGLRenderTarget
  private rtB!: THREE.WebGLRenderTarget
  private readIdx = 0   // 0 = read from rtA, write to rtB; 1 = vice versa
  private sampleCount = 0
  private traceScene!: THREE.Scene
  private displayScene!: THREE.Scene
  private frameNumber = 0

  // ---- helpers ------------------------------------------------------------

  private makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    })
  }

  // ---- SceneModule --------------------------------------------------------

  init(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth  || canvas.width
    const h = canvas.clientHeight || canvas.height

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(w, h, false)

    // Full-screen quad geometry
    const geo = new THREE.PlaneGeometry(2, 2)

    // ---------- Trace material ----------
    this.traceMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: TRACE_FRAG,
      uniforms: {
        uResolution:  { value: new THREE.Vector2(w, h) },
        uFrame:       { value: 0 },
        uPrevAccum:   { value: null },
        uSamples:     { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    // ---------- Display material ----------
    this.displayMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DISPLAY_FRAG,
      uniforms: {
        uAccum:   { value: null },
        uSamples: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.quad = new THREE.Mesh(geo, this.traceMat)

    // Separate scenes for each pass
    this.traceScene   = new THREE.Scene()
    this.displayScene = new THREE.Scene()
    this.traceScene.add(this.quad)

    const displayQuad = new THREE.Mesh(geo, this.displayMat)
    this.displayScene.add(displayQuad)

    // Orthographic camera for full-screen passes
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Render targets (ping-pong)
    this.rtA = this.makeRT(w, h)
    this.rtB = this.makeRT(w, h)

    // Store ortho camera for use in update
    ;(this as any)._ortho = ortho
  }

  update(_time: number): void {
    const ortho: THREE.OrthographicCamera = (this as any)._ortho

    // Which RT holds previous accumulation and which is the write target
    const readRT  = this.readIdx === 0 ? this.rtA : this.rtB
    const writeRT = this.readIdx === 0 ? this.rtB : this.rtA

    // --- Trace pass: write one new sample into writeRT ---
    this.traceMat.uniforms['uPrevAccum'].value = readRT.texture
    this.traceMat.uniforms['uFrame'].value     = this.frameNumber
    this.traceMat.uniforms['uSamples'].value   = this.sampleCount

    this.quad.material = this.traceMat
    this.renderer.setRenderTarget(writeRT)
    this.renderer.render(this.traceScene, ortho)

    this.sampleCount++
    this.frameNumber++
    this.readIdx = 1 - this.readIdx

    // --- Display pass: average writeRT and blit to canvas ---
    this.displayMat.uniforms['uAccum'].value   = writeRT.texture
    this.displayMat.uniforms['uSamples'].value = this.sampleCount

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.displayScene, ortho)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)

    // Dispose old render targets
    this.rtA.dispose()
    this.rtB.dispose()

    // Recreate at new size
    this.rtA = this.makeRT(width, height)
    this.rtB = this.makeRT(width, height)

    // Update resolution uniform
    this.traceMat.uniforms['uResolution'].value.set(width, height)

    // Reset accumulation so we don't blend different resolutions
    this.sampleCount = 0
    this.readIdx     = 0
    this.frameNumber = 0
  }

  destroy(): void {
    this.rtA.dispose()
    this.rtB.dispose()
    this.quad.geometry.dispose()
    this.traceMat.dispose()
    this.displayMat.dispose()
    this.renderer.dispose()
  }

  get orbitCamera(): undefined {
    return undefined
  }
}
