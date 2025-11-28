<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: PolarShapesScene

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
uniform float u_smoothness;
uniform float u_shape;
uniform float u_time;

void main() {
    vec2 st = gl_FragCoord.xy/u_resolution.xy;
    vec3 color = vec3(0.0);

    vec2 pos = vec2(0.5)-st;

    float r = length(pos)*2.0;
    float a = atan(pos.y,pos.x);

    float f = cos(a*(3.0+u_time));
    if (u_shape == 1.0) {
        f = abs(cos(a*(9.832+u_time)));
    } else if (u_shape == 2.0) {
        f = abs(cos(a*(2.5+u_time)))*.5+.3;
    } else if (u_shape == 3.0) {
        f = abs(cos(a*(12.+u_time))*sin(a*(3.848+u_time)))*.8+.1;
    } else if (u_shape == 4.0) {
        f = smoothstep(-.5,1., cos(a*(11.008+u_time)))*0.2+0.5;
    }

    color = vec3( 1.-smoothstep(f,f+u_smoothness,r) + u_color );

    gl_FragColor = vec4(color, 1.0);
}
`

class PolarShapesScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_color: [0.0, 1.0, 0.0],
    u_smoothness: 0.01,
    u_shape: 0,
    options: { Option1: 0, Option2: 1, Option3: 2, Option4: 3, Option5: 4 },
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
      u_color: { value: this.uiState.u_color },
      u_smoothness: { value: this.uiState.u_smoothness },
      u_shape: { value: this.uiState.u_shape },
      u_time: { value: 0.0 },
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
    const elapsedTime = this.clock.getElapsedTime()

    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_smoothness.value = this.uiState.u_smoothness
    this.uniforms.u_shape.value = this.uiState.u_shape
    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_shape', this.uiState.options)
    this.gui.add(this.uiState, 'u_smoothness', 0.01, 0.5, 0.01)
    this.gui.addColor(this.uiState, 'u_color')
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new PolarShapesScene()
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
