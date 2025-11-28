<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: MultiColorMixScene

const vertexShader = `
attribute vec3 colors;

varying vec2 vUvs;
varying vec3 vColor;

void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;

    // uv is provided by THREE.js
    vUvs = uv;
    vColor = colors;
}
`

const fragmentShader = `
varying vec2 vUvs;
varying vec3 vColor;

void main() {
	  gl_FragColor = vec4(vColor, 1.0);
}
`

class MultiColorMixScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    color1: [1.0, 0.0, 0.0],
    color2: [0.0, 1.0, 0.0],
    color3: [0.0, 0.0, 1.0],
    color4: [0.0, 1.0, 1.0],
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
      color1: {
        value: this.uiState.color1,
      },
      color2: {
        value: this.uiState.color2,
      },
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    })

    const colors = [
      ...this.uiState.color1,
      ...this.uiState.color2,
      ...this.uiState.color3,
      ...this.uiState.color4,
    ]

    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.setAttribute('colors', new THREE.Float32BufferAttribute(colors, 3))

    const plane = new THREE.Mesh(geometry, material)
    plane.position.set(0.5, 0.5, 0)
    this.scene.add(plane)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    this.uniforms.color1.value = this.uiState.color1
    this.uniforms.color2.value = this.uiState.color2

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {}
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new MultiColorMixScene()
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
