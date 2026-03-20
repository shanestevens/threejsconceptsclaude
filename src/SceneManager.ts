import type { SceneModule } from './types'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface ManagedScene {
  module: SceneModule | null
  canvas: HTMLCanvasElement
  active: boolean
  animationId: number | null
  startTime: number
  controls?: OrbitControls
}

export class SceneManager {
  private scenes = new Map<string, ManagedScene>()
  private observer: IntersectionObserver

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-scene-id')
          if (id) {
            if (entry.isIntersecting) {
              this.activate(id)
            } else {
              this.deactivate(id)
            }
          }
        })
      },
      { threshold: 0.1 }
    )
  }

  register(id: string, canvas: HTMLCanvasElement): void {
    this.scenes.set(id, {
      module: null,
      canvas,
      active: false,
      animationId: null,
      startTime: 0,
    })
    this.observer.observe(canvas)
  }

  private async activate(id: string): Promise<void> {
    const entry = this.scenes.get(id)
    if (!entry || entry.active) return

    entry.active = true
    entry.startTime = performance.now()

    if (!entry.module) {
      entry.module = await this.loadScene(id)
      if (!entry.module) return

      const rect = entry.canvas.getBoundingClientRect()
      entry.module.init(entry.canvas)
      entry.module.resize(rect.width, rect.height)

      if (entry.module.orbitCamera) {
        entry.controls = new OrbitControls(entry.module.orbitCamera, entry.canvas)
        entry.controls.enableDamping = true
        entry.controls.dampingFactor = 0.08
        entry.controls.enableZoom = true
        entry.controls.zoomSpeed = 0.6
        entry.controls.rotateSpeed = 0.8
      }
    }

    const loop = (now: number): void => {
      if (!entry.active) return
      entry.controls?.update()
      const t = (now - entry.startTime) / 1000
      entry.module!.update(t)
      entry.animationId = requestAnimationFrame(loop)
    }
    entry.animationId = requestAnimationFrame(loop)
  }

  private deactivate(id: string): void {
    const entry = this.scenes.get(id)
    if (!entry) return
    entry.active = false
    if (entry.animationId !== null) {
      cancelAnimationFrame(entry.animationId)
      entry.animationId = null
    }
  }

  private async loadScene(id: string): Promise<SceneModule | null> {
    try {
      switch (id) {
        case '__hero__':
        case 'hello': {
          const { SpinningCube } = await import('./scenes/SpinningCube')
          return new SpinningCube()
        }
        case 'geometry': {
          const { GeometryScene } = await import('./scenes/Geometry')
          return new GeometryScene()
        }
        case 'materials': {
          const { MaterialsScene } = await import('./scenes/Materials')
          return new MaterialsScene()
        }
        case 'lighting': {
          const { LightingScene } = await import('./scenes/Lighting')
          return new LightingScene()
        }
        case 'shadows': {
          const { ShadowsScene } = await import('./scenes/Shadows')
          return new ShadowsScene()
        }
        case 'particles': {
          const { ParticlesScene } = await import('./scenes/Particles')
          return new ParticlesScene()
        }
        case 'shaders': {
          const { ShadersScene } = await import('./scenes/Shaders')
          return new ShadersScene()
        }
        case 'environment': {
          const { EnvironmentScene } = await import('./scenes/Environment')
          return new EnvironmentScene()
        }
        case 'instancing': {
          const { InstancingScene } = await import('./scenes/Instancing')
          return new InstancingScene()
        }
        case 'textures': {
          const { TexturesScene } = await import('./scenes/Textures')
          return new TexturesScene()
        }
        case 'raycasting': {
          const { RaycastingScene } = await import('./scenes/Raycasting')
          return new RaycastingScene()
        }
        case 'scenegraph': {
          const { SceneGraphScene } = await import('./scenes/SceneGraph')
          return new SceneGraphScene()
        }
        case 'curves': {
          const { CurvesScene } = await import('./scenes/Curves')
          return new CurvesScene()
        }
        case 'fog': {
          const { FogScene } = await import('./scenes/Fog')
          return new FogScene()
        }
        // ── Intermediate ─────────────────────────────────────
        case 'animation-mixer': {
          const { AnimationMixerScene } = await import('./scenes/AnimationMixer')
          return new AnimationMixerScene()
        }
        case 'morph-targets': {
          const { MorphTargetsScene } = await import('./scenes/MorphTargets')
          return new MorphTargetsScene()
        }
        case 'render-target': {
          const { RenderTargetScene } = await import('./scenes/RenderTargetScene')
          return new RenderTargetScene()
        }
        case 'sprites': {
          const { SpriteScene } = await import('./scenes/SpriteScene')
          return new SpriteScene()
        }
        case 'lines': {
          const { LinesScene } = await import('./scenes/LinesScene')
          return new LinesScene()
        }
        case 'post-processing': {
          const { PostProcessingScene } = await import('./scenes/PostProcessingScene')
          return new PostProcessingScene()
        }
        case 'custom-geometry': {
          const { CustomGeometryScene } = await import('./scenes/CustomGeometryScene')
          return new CustomGeometryScene()
        }
        case 'pbr-workflow': {
          const { PBRWorkflowScene } = await import('./scenes/PBRWorkflowScene')
          return new PBRWorkflowScene()
        }
        case 'canvas-texture': {
          const { CanvasTextureScene } = await import('./scenes/CanvasTextureScene')
          return new CanvasTextureScene()
        }
        // ── Advanced ──────────────────────────────────────────
        case 'gpgpu': {
          const { GPGPUScene } = await import('./scenes/GPGPUScene')
          return new GPGPUScene()
        }
        case 'ray-marching': {
          const { RayMarchingScene } = await import('./scenes/RayMarchingScene')
          return new RayMarchingScene()
        }
        case 'procedural-terrain': {
          const { ProceduralTerrainScene } = await import('./scenes/ProceduralTerrainScene')
          return new ProceduralTerrainScene()
        }
        case 'hologram': {
          const { HologramScene } = await import('./scenes/HologramScene')
          return new HologramScene()
        }
        case 'cloth-sim': {
          const { ClothScene } = await import('./scenes/ClothScene')
          return new ClothScene()
        }
        case 'depth-buffer': {
          const { DepthBufferScene } = await import('./scenes/DepthBufferScene')
          return new DepthBufferScene()
        }
        case 'volumetric-light': {
          const { VolumetricLightScene } = await import('./scenes/VolumetricLightScene')
          return new VolumetricLightScene()
        }
        case 'reaction-diffusion': {
          const { ReactionDiffusionScene } = await import('./scenes/ReactionDiffusionScene')
          return new ReactionDiffusionScene()
        }
        case 'batched-mesh': {
          const { BatchedMeshScene } = await import('./scenes/BatchedMeshScene')
          return new BatchedMeshScene()
        }
        case 'gpu-picking': {
          const { GPUPickingScene } = await import('./scenes/GPUPickingScene')
          return new GPUPickingScene()
        }
        default:
          return null
      }
    } catch (e) {
      console.error(`Failed to load scene "${id}":`, e)
      return null
    }
  }

  handleResize(id: string): void {
    const entry = this.scenes.get(id)
    if (!entry?.module) return
    const rect = entry.canvas.getBoundingClientRect()
    entry.module.resize(rect.width, rect.height)
  }

  destroy(): void {
    this.observer.disconnect()
    this.scenes.forEach((entry, id) => {
      this.deactivate(id)
      entry.controls?.dispose()
      entry.module?.destroy()
    })
  }
}
