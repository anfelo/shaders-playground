<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)

const vertexShader = `
void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}
`

const fragmentShader = `
void main() {
	  gl_FragColor = vec4(1.0, 0.0, 0.0,1.0);
}
`

class ShapingFunctionsScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  constructor() {}

  destroy() {
    this.renderer.setAnimationLoop(null)
    // Dispose renderer
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()

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

    this.camera.position.set(0, 0, 1)

    await this.setupProject()

    this.onWindowResize()
    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
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
    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  const scene = new ShapingFunctionsScene()
  scene.init()
})
</script>

<template>
  <component :is="canvasWrapperElement" ref="elementRef" />
</template>

<style scoped></style>
