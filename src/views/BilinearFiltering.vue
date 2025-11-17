<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: BilinearFilteringScene

const vertexShader = `
varying vec2 v_uvs;

void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
    v_uvs = uv;
}
`

const fragmentShader = `
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D diffuse;

varying vec2 v_uvs;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float random2(vec2 p) {
    p = 50.0*fract(p*0.3183099 + vec2(0.71,0.113));
    return -1.0+2.0*fract(p.x*p.y*(p.x+p.y));
}

vec4 noise(vec2 coords) {
    vec2 tex_size = vec2(1.0);
    vec2 pc = coords * tex_size;
    vec2 base = floor(pc);

    float s1 = random2((base + vec2(0.0, 0.0)) / tex_size);
    float s2 = random2((base + vec2(1.0, 0.0)) / tex_size);
    float s3 = random2((base + vec2(0.0, 1.0)) / tex_size);
    float s4 = random2((base + vec2(1.0, 1.0)) / tex_size);

    vec2 f = smoothstep(0.0, 1.0, fract(pc));

    float px1 = mix(s1, s2, f.x);
    float px2 = mix(s3, s4, f.x);
    float result = mix(px1, px2, f.y);

    return vec4(result);
}

vec4 filtered_sample(sample2D target, vec2 coords) {
    vec2 tex_size = vec2(2.0);
    vec2 pc = coords * tex_size - 0.5;
    vec2 base = floor(pc) + 0.5;

    vec4 s1 = texture2D(target, (base + vec2(0.0, 0.0)) / tex_size);
    vec4 s2 = texture2D(target, (base + vec2(1.0, 0.0)) / tex_size);
    vec4 s3 = texture2D(target, (base + vec2(0.0, 1.0)) / tex_size);
    vec4 s4 = texture2D(target, (base + vec2(1.0, 1.0)) / tex_size);

    vec2 f = smoothstep(0.0, 1.0, fract(pc));

    vec4 px1 = mix(s1, s2, f.x);
    vec4 px2 = mix(s3, s4, f.x);
    vec4 result = mix(px1, px2, f.y);
    return result;
}

void main() {
    vec4 color = noise(v_uvs * 20.0);

    gl_FragColor = color;
}
`

class BilinearFilteringScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  gui = new GUI()
  uiState = {
    u_time: { value: 0.0 },
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
      u_time: { value: this.uiState.u_time },
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

    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private initDebugUI() {}
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new BilinearFilteringScene()
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
