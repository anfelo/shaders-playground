<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: LinearPlotScene

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

// Plot a line on Y using a value between 0.0-1.0
float plot(vec2 st) {
    return smoothstep(u_stroke, 0.0, abs(st.y - st.x));
}

void main() {
    vec2 st = gl_FragCoord.xy/u_resolution;

    float y = st.x;

    vec3 color = vec3(y);

    // Plot a line
    float pct = plot(st);
    color = (1.0-pct)*color+pct*vec3(u_color);

    gl_FragColor = vec4(color,1.0);
}
`

class LinearPlotScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_stroke: 0.02,
    u_color: [0.0, 1.0, 0.0],
  }

  constructor() {
    super(window.innerWidth - 250, window.innerHeight)
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
      u_resolution: { value: [window.innerWidth - 250, window.innerHeight] },
      u_stroke: { value: this.uiState.u_stroke },
      u_color: { value: this.uiState.u_color },
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

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_stroke', 0.001, 4.0, 0.001)
    this.gui.addColor(this.uiState, 'u_color')
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new LinearPlotScene()
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
