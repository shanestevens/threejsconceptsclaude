import * as THREE from 'three'
import type { SceneModule } from '../types'

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2  uResolution;

// ── SDFs ───────────────────────────────────────────────────
float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Smooth minimum — blend two surfaces
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// ── Scene SDF ──────────────────────────────────────────────
float scene(vec3 p) {
  vec3 p1 = p - vec3(sin(uTime*0.7)*0.6,  cos(uTime*0.5)*0.3, 0.0);
  vec3 p2 = p - vec3(cos(uTime*0.6)*0.5, -sin(uTime*0.4)*0.4, sin(uTime*0.5)*0.3);
  vec3 p3 = p - vec3(0.0, sin(uTime*0.3)*0.2, cos(uTime*0.6)*0.4);

  float s = sdSphere(p1, 0.45);
  float t = sdTorus(p2 - vec3(0.0, 0.0, 0.0), vec2(0.7, 0.18));
  float b = sdBox(p3, vec3(0.28, 0.28, 0.28));

  return smin(smin(s, t, 0.35), b, 0.25);
}

// ── Normal via central differences ─────────────────────────
vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  return normalize(vec3(
    scene(p + vec3(e,0,0)) - scene(p - vec3(e,0,0)),
    scene(p + vec3(0,e,0)) - scene(p - vec3(0,e,0)),
    scene(p + vec3(0,0,e)) - scene(p - vec3(0,0,e))
  ));
}

// ── IQ cosine palette ──────────────────────────────────────
vec3 palette(float t) {
  return 0.5 + 0.5*cos(6.28318*(vec3(0.0,0.33,0.67) + t));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution*0.5) / min(uResolution.x, uResolution.y);

  // Rotating camera
  float ca = uTime * 0.25;
  vec3 ro = vec3(sin(ca)*2.8, 0.5, cos(ca)*2.8);
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0,1,0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*ww);

  // Sphere trace
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = scene(ro + rd*t);
    if (d < 0.001) { hit = true; break; }
    if (t > 12.0) break;
    t += d;
  }

  vec3 col = vec3(0.04, 0.04, 0.09);

  if (hit) {
    vec3 p = ro + rd*t;
    vec3 n = calcNormal(p);

    vec3 lig = normalize(vec3(1.0, 1.2, 0.8));
    float dif = max(dot(n, lig), 0.0);
    float amb = 0.15 + 0.85*dot(n, vec3(0,1,0))*0.5;

    // Soft shadow
    float sha = 1.0;
    vec3  sp  = p + n*0.002;
    float st  = 0.01;
    for (int j = 0; j < 24; j++) {
      float sd = scene(sp + lig*st);
      sha = min(sha, 10.0*sd/st);
      st += 0.08;
      if (st > 2.5) break;
    }
    sha = clamp(sha, 0.0, 1.0);

    // Colour from distance + time
    vec3 baseCol = palette(t*0.15 + uTime*0.08);
    col = baseCol * (dif*sha*0.9 + amb*0.3);

    // Fresnel rim
    float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col += fre * palette(t*0.1 + uTime*0.1 + 0.5) * 0.8;
  }

  // Gamma
  col = pow(max(col, 0.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`

export class RayMarchingScene implements SceneModule {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.OrthographicCamera
  private scene!: THREE.Scene
  private uniforms!: { uTime: { value: number }; uResolution: { value: THREE.Vector2 } }

  init(canvas: HTMLCanvasElement): void {
    const { width, height } = canvas.getBoundingClientRect()

    this.scene  = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(1) // render at 1:1 — fragment is expensive

    this.uniforms = {
      uTime:       { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
      fragmentShader: FRAG,
    })

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
  }

  update(time: number): void {
    this.uniforms.uTime.value = time
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
    this.uniforms.uResolution.value.set(width, height)
  }

  destroy(): void {
    this.renderer.dispose()
  }
}
