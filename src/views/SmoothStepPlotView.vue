<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: SmoothStepPlotScene

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

float plot(vec2 st, float pct) {
    return smoothstep( pct-u_stroke, pct, st.y) -
           smoothstep( pct, pct+u_stroke, st.y);
}
void main() {
    vec2 st = gl_FragCoord.xy/u_resolution;

    float y = step(0.5, st.x);

    if (u_smooth) {
        y = smoothstep(u_smooth_range.x, u_smooth_range.y, st.x);
    }

    vec3 color = vec3(y);

    float pct = plot(st,y);
    color = (1.0-pct)*color+pct*vec3(u_color);

    gl_FragColor = vec4(color,1.0);
}
`

class SmoothStepPlotScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_stroke: 0.02,
    u_color: [0.0, 1.0, 0.0],
    u_smooth: false,
    u_smooth_min: 0.1,
    u_smooth_max: 0.9,
  }

  async init(): Promise<void> {
    super.init()

    if (!this.playgroundEl) {
      console.error('Playground element not initialized')
      return
    }

    this.playgroundEl.appendChild(this.renderer.domElement)

    this.initDebugUI()

    this.camera.position.set(0, 0, 1)

    await this.setupProject()

    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.uniforms = {
      u_resolution: { value: [this.width, this.height] },
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
    this.uniforms.u_stroke.value = this.uiState.u_stroke
    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_smooth.value = this.uiState.u_smooth
    this.uniforms.u_smooth_range.value = [this.uiState.u_smooth_min, this.uiState.u_smooth_max]

    this.renderer.render(this.scene, this.camera)
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

  scene = new SmoothStepPlotScene()
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
