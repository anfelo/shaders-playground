<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: RectangleShapeScene

const vertexShader = `
void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}
`

const fragmentShader = `
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_stroke;
uniform bool u_smooth;
uniform vec2 u_smooth_range;

void main() {
    vec2 st = gl_FragCoord.xy/u_resolution;
    vec3 color = vec3(u_color);

    // bottom-left
    vec2 bl = step(vec2(u_stroke),st);
    float pct = bl.x * bl.y;

    // top-right
    vec2 tr = step(vec2(u_stroke),1.0-st);
    pct *= tr.x * tr.y;

    if (u_smooth) {
      // bottom-left
      bl = smoothstep(vec2(u_smooth_range.x), vec2(u_smooth_range.y), st);
      pct = bl.x * bl.y;

      // top-right
      tr = smoothstep(vec2(u_smooth_range.x), vec2(u_smooth_range.y), 1.0-st);
      pct *= tr.x * tr.y;
    }

    color = vec3(pct+u_color);

    gl_FragColor = vec4(color,1.0);
}
`

class RectangleShapeScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  gui = new GUI()
  uiState = {
    u_stroke: 0.02,
    u_color: [0.0, 1.0, 0.0],
    u_smooth: false,
    u_smooth_min: 0.01,
    u_smooth_max: 0.03,
  }

  constructor() {}

  destroy() {
    this.renderer.setAnimationLoop(null)
    // Dispose renderer
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()

    this.gui.destroy()

    // Remove event listeners
    window.removeEventListener('resize', this.onWindowResize)
  }

  async init(): Promise<void> {
    if (!this.playgroundEl) {
      console.error('Playground element not initialized')
      return
    }

    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.playgroundEl.appendChild(this.renderer.domElement)

    window.addEventListener('resize', () => this.onWindowResize(), false)

    this.initDebugUI()

    this.camera.position.set(0, 0, 1)

    await this.setupProject()

    this.onWindowResize()
    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.uniforms = {
      u_resolution: { value: [window.innerWidth, window.innerHeight] },
      u_stroke: { value: this.uiState.u_stroke },
      u_color: { value: this.uiState.u_color },
      u_smooth: { value: this.uiState.u_smooth },
      u_smooth_range: { value: [this.uiState.u_smooth_min, this.uiState.u_smooth_max] },
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    })

    const geometry = new THREE.PlaneGeometry(1, 1)

    const plane = new THREE.Mesh(geometry, material)
    plane.position.set(0.5, 0.5, 0)
    this.scene.add(plane)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
    this.uniforms.u_stroke.value = this.uiState.u_stroke
    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_smooth.value = this.uiState.u_smooth
    this.uniforms.u_smooth_range.value = [this.uiState.u_smooth_min, this.uiState.u_smooth_max]

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_smooth')
    this.gui.add(this.uiState, 'u_smooth_min', 0, 1, 0.01)
    this.gui.add(this.uiState, 'u_smooth_max', 0, 1, 0.01)
    this.gui.add(this.uiState, 'u_stroke', 0.001, 4.0, 0.001)
    this.gui.addColor(this.uiState, 'u_color')
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new RectangleShapeScene()
  scene.init()
})

onBeforeUnmount(() => {
  scene?.destroy()
})
</script>

<template>
  <component :is="canvasWrapperElement" ref="elementRef" />
</template>

<style scoped></style>
