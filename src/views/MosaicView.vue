<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: MosaicScene

const vertexShader = `
void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}
`

const fragmentShader = `
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_size;

float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 st = gl_FragCoord.xy/u_resolution.xy;

    st *= u_size; // Scale the coordinate system by 10
    vec2 ipos = floor(st);  // get the integer coords
    vec2 fpos = fract(st);  // get the fractional coords

    // Assign a random value based on the integer coord
    vec3 color = vec3(random( ipos ));

    // Uncomment to see the subdivided grid
    //color = vec3(fpos,0.0);

    gl_FragColor = vec4(color,1.0);
}
`

class MosaicScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_time: { value: 0.0 },
    u_size: 10.0,
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
      u_time: { value: this.uiState.u_time },
      u_size: { value: this.uiState.u_size },
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

    this.uniforms.u_size.value = this.uiState.u_size
    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_size', 1.0, 20.0, 1.0)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new MosaicScene()
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
