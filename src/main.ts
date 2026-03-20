import type { Level, Section } from './types'
import { basicSections } from './sections.basic'
import { intermediateSections } from './sections.intermediate'
import { advancedSections } from './sections.advanced'
import { physicsSections } from './sections.physics'
import { experimentalSections } from './sections.experimental'
import { SceneManager } from './SceneManager'
import './style.css'

// ── Accent colour map ────────────────────────────────────────
const ACCENT: Record<string, string> = {
  // Basic
  hello: '#6366f1', geometry: '#f59e0b', materials: '#10b981',
  lighting: '#f97316', shadows: '#8b5cf6', particles: '#ec4899',
  shaders: '#06b6d4', environment: '#14b8a6', instancing: '#ef4444',
  textures: '#22c55e', raycasting: '#a855f7', scenegraph: '#eab308',
  curves: '#f43f5e', fog: '#94a3b8',
  // Intermediate
  'animation-mixer': '#f97316', 'morph-targets': '#ec4899',
  'render-target': '#06b6d4', sprites: '#fbbf24', lines: '#6366f1', 'canvas-texture': '#10b981',
  'post-processing': '#a855f7', 'custom-geometry': '#10b981', 'pbr-workflow': '#f43f5e',
  // Advanced
  gpgpu: '#ef4444', 'ray-marching': '#06b6d4', 'procedural-terrain': '#22c55e',
  hologram: '#00ffcc', 'cloth-sim': '#8b5cf6', 'depth-buffer': '#f59e0b',
  'volumetric-light': '#fbbf24', 'reaction-diffusion': '#a3e635', 'batched-mesh': '#6366f1',
  'gpu-picking': '#ec4899', 'strange-attractor': '#818cf8', 'metaballs': '#34d399',
  'ocean': '#38bdf8',
  // Physics
  'physics-rigid-bodies': '#f97316', 'physics-wrecking-ball': '#ef4444',
  'physics-dominoes': '#6366f1', 'physics-jenga': '#22c55e', 'physics-ragdoll': '#ec4899',
  // Experimental
  'fluid-sim': '#38bdf8', 'path-tracer': '#a78bfa', 'particle-life': '#34d399',
  'audio-visualizer': '#f472b6', 'game-of-life': '#00ffcc',
}

const LEVEL_META: Record<Level, { label: string; badge: string; headline: string; sub: string }> = {
  basic: {
    label: 'Basic',
    badge: '14 concepts',
    headline: 'Start Here',
    sub: 'Scene, Camera, Renderer, Geometry, Materials, Lighting, Shadows, Shaders and more.',
  },
  intermediate: {
    label: 'Intermediate',
    badge: '9 concepts',
    headline: 'Going Deeper',
    sub: 'AnimationMixer, MorphTargets, RenderTargets, Post-Processing, and custom geometry.',
  },
  advanced: {
    label: 'Advanced',
    badge: '14 concepts',
    headline: 'GPU-Level Mastery',
    sub: 'GPGPU, Ray Marching, Procedural Terrain, Cloth Simulation, Depth Buffer effects, and more.',
  },
  physics: {
    label: 'Physics',
    badge: '5 demos',
    headline: 'Physics Simulation',
    sub: 'Rigid Bodies, Wrecking Ball, Dominoes, Jenga and Ragdoll — all powered by Rapier.js.',
  },
  experimental: {
    label: 'Experimental',
    badge: '5 demos',
    headline: 'Pushing the Envelope',
    sub: 'Navier-Stokes fluid, Monte Carlo path tracing, Particle Life, Audio Visualizer, and GPU Game of Life.',
  },
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── State ────────────────────────────────────────────────────
let currentLevel: Level = 'basic'
let sceneManager = new SceneManager()

// ── Build ────────────────────────────────────────────────────
function sectionsFor(level: Level): Section[] {
  if (level === 'intermediate')  return intermediateSections
  if (level === 'advanced')      return advancedSections
  if (level === 'physics')       return physicsSections
  if (level === 'experimental')  return experimentalSections
  return basicSections
}

function renderTopNav(): string {
  return `
    <nav class="level-nav" id="level-nav">
      <div class="level-nav-inner">
        <span class="brand">Three.js Concepts</span>
        <div class="level-tabs">
          ${(['basic', 'intermediate', 'advanced', 'physics', 'experimental'] as Level[]).map((l) => `
            <button class="level-tab ${l === currentLevel ? 'active' : ''}" data-level="${l}">
              ${LEVEL_META[l].label}
              <span class="tab-count">${LEVEL_META[l].badge}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </nav>
  `
}

function renderHero(): string {
  return `
    <header class="hero">
      <div class="hero-content">
        <div class="hero-badge">Interactive Guide</div>
        <h1>Three.js<br/><span class="gradient-text">Concepts</span></h1>
        <p class="hero-desc">
          A visual walkthrough of the core building blocks — from your first spinning cube
          to GPGPU particle systems and SDF ray marching.
        </p>
        <a href="#hello" class="hero-cta">Start exploring ↓</a>
      </div>
      <div class="hero-canvas-wrap">
        <canvas id="hero-canvas" data-scene-id="__hero__"></canvas>
      </div>
    </header>
  `
}

function renderLevelHeader(level: Level): string {
  const meta = LEVEL_META[level]
  const colors = ['#6366f1', '#ec4899', '#f97316', '#06b6d4']
  const dots   = colors.map((c) => `<span class="lh-dot" style="background:${c}"></span>`).join('')
  return `
    <header class="level-header">
      <div class="level-header-inner">
        <div class="lh-dots">${dots}</div>
        <div class="lh-badge">${meta.label}</div>
        <h1>${meta.headline}</h1>
        <p>${meta.sub}</p>
      </div>
    </header>
  `
}

function renderSections(sections: Section[]): string {
  return sections.map((s, i) => {
    const num = String(i + 1).padStart(2, '0')
    return `
      <section id="${s.id}" class="concept-section ${i % 2 === 0 ? 'even' : 'odd'}">
        <div class="section-inner">
          <div class="section-text">
            <div class="section-number">${num}</div>
            <div class="section-tags">
              ${s.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
            </div>
            <h2>${s.title}</h2>
            <p class="subtitle">${s.subtitle}</p>
            <p class="description">${s.description}</p>
            <details class="code-block">
              <summary>View code</summary>
              <pre><code>${escapeHTML(s.code)}</code></pre>
            </details>
          </div>
          <div class="section-canvas-wrap">
            <canvas class="scene-canvas" data-scene-id="${s.id}" id="canvas-${s.id}"></canvas>
            <div class="canvas-hint">⟳ drag &nbsp;·&nbsp; scroll to zoom</div>
          </div>
        </div>
      </section>
    `
  }).join('')
}

function renderSideNav(sections: Section[]): string {
  return `
    <nav class="side-nav" aria-label="Sections">
      ${sections.map((s) => `
        <a href="#${s.id}" class="nav-dot" data-id="${s.id}" title="${s.title}"></a>
      `).join('')}
    </nav>
  `
}

function buildPage(level: Level): void {
  const app = document.getElementById('app')!
  const sections = sectionsFor(level)

  const mainHeader = level === 'basic' ? renderHero() : renderLevelHeader(level)

  app.innerHTML = `
    ${renderTopNav()}
    ${renderSideNav(sections)}
    ${mainHeader}
    <main>${renderSections(sections)}</main>
    <footer class="site-footer">
      <p>Built with <a href="https://threejs.org" target="_blank" rel="noopener">Three.js</a> &amp; TypeScript</p>
    </footer>
  `
}

// ── Apply per-section accent colours ────────────────────────
function applyAccents(): void {
  document.querySelectorAll<HTMLElement>('.concept-section').forEach((el) => {
    const hex = ACCENT[el.id] ?? '#6366f1'
    el.style.setProperty('--accent',        hex)
    el.style.setProperty('--accent-glow',   hexToRgba(hex, 0.18))
    el.style.setProperty('--accent-bg',     hexToRgba(hex, 0.1))
    el.style.setProperty('--accent-border', hexToRgba(hex, 0.25))
  })
}

// ── Scene wiring ──────────────────────────────────────────────
function initScenes(): void {
  document.querySelectorAll<HTMLCanvasElement>('.scene-canvas').forEach((canvas) => {
    const id = canvas.getAttribute('data-scene-id')
    if (id) sceneManager.register(id, canvas)
  })
  const heroCanvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null
  if (heroCanvas) sceneManager.register('__hero__', heroCanvas)
}

function initResizeObserver(): void {
  const ro = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const canvas = entry.target as HTMLCanvasElement
      const id = canvas.getAttribute('data-scene-id')
      if (id) sceneManager.handleResize(id)
    })
  })
  document.querySelectorAll<HTMLCanvasElement>('.scene-canvas').forEach((c) => ro.observe(c))
}

// ── Side-nav highlight ────────────────────────────────────────
function initNavHighlight(): void {
  const dots = document.querySelectorAll<HTMLAnchorElement>('.nav-dot')
  const sections = document.querySelectorAll<HTMLElement>('.concept-section')

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id  = entry.target.id
          const hex = ACCENT[id] ?? '#6366f1'
          dots.forEach((d) => d.classList.toggle('active', d.dataset.id === id))
          document.documentElement.style.setProperty('--nav-active-color', hex)
        }
      })
    },
    { threshold: 0.5 }
  )
  sections.forEach((s) => io.observe(s))
}

function initSmoothScroll(): void {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href')
      const target = href ? document.querySelector(href) : null
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }) }
    })
  })
}

// ── Tab switching ─────────────────────────────────────────────
function switchLevel(level: Level): void {
  if (level === currentLevel) return
  sceneManager.destroy()
  sceneManager = new SceneManager()
  currentLevel = level
  buildPage(level)
  applyAccents()
  initScenes()
  initNavHighlight()
  initResizeObserver()
  initSmoothScroll()
  wireTabClicks()
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function wireTabClicks(): void {
  document.querySelectorAll<HTMLButtonElement>('.level-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchLevel(btn.dataset.level as Level))
  })
}

// ── Boot ──────────────────────────────────────────────────────
buildPage(currentLevel)
applyAccents()
initScenes()
initNavHighlight()
initResizeObserver()
initSmoothScroll()
wireTabClicks()
