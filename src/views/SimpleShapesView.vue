<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: SimpleShapesScene

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
uniform float u_cell_size;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

vec3 black = vec3(0.0, 0.0, 0.0);

// Reference to
// http://thndl.com/square-shaped-shaders.html

void main(){
    vec2 st = gl_FragCoord.xy/u_resolution.xy;
    vec3 color = vec3(0.75);

    vec2 center = st - 0.5;
    vec2 cell = fract(center * u_resolution / u_cell_size);
    cell = abs(cell - 0.5);
    float distToCell = 1.0 - 2.0 * max(cell.x, cell.y);

    float cellLine = smoothstep(0.0, 0.05, distToCell);

    color = mix(vec3(0.0), color, cellLine);

    gl_FragColor = vec4(color+u_color, 1.0);
}
`

class SimpleShapesScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  gui = new GUI()
  uiState = {
    u_color: [0.0, 0.0, 0.0],
    u_cell_size: 100.0,
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
      u_color: { value: this.uiState.u_color },
      u_cell_size: { value: this.uiState.u_cell_size },
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
    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_cell_size.value = this.uiState.u_cell_size

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_cell_size', 10.0, 200.0, 1.0)
    this.gui.addColor(this.uiState, 'u_color')
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new SimpleShapesScene()
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
