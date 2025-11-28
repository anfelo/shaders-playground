<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: TriangleShapeScene

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
uniform float u_radius;
uniform int u_sides;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

// Reference to
// http://thndl.com/square-shaped-shaders.html

void main(){
    vec2 st = gl_FragCoord.xy/u_resolution.xy;
    st.x *= u_resolution.x/u_resolution.y;
    vec3 color = vec3(0.0);
    float d = 0.0;

    // Remap the space to -1. to 1.
    st = st *2.-1.;

    // Number of sides of your shape
    int N = u_sides;

    // Angle and radius from the current pixel
    float a = atan(st.x,st.y)+PI;
    float r = TWO_PI/float(N);

    // Shaping function that modulate the distance
    d = cos(floor(.5+a/r)*r-a)*length(st);

    color = vec3(1.0-smoothstep(u_radius,u_radius,d));
    // color = vec3(d);

    gl_FragColor = vec4(color + u_color, 1.0);
}
`

class TriangleShapeScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_color: [0.0, 0.0, 0.0],
    u_radius: 0.40,
    u_sides: 3,
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
      u_radius: { value: this.uiState.u_radius },
      u_sides: { value: this.uiState.u_sides },
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
    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_radius.value = this.uiState.u_radius
    this.uniforms.u_sides.value = this.uiState.u_sides

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'u_radius', 0.1, 0.7, 0.01)
    this.gui.add(this.uiState, 'u_sides', 2, 10, 1)
    this.gui.addColor(this.uiState, 'u_color')
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new TriangleShapeScene()
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
