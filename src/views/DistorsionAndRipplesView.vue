<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: DistorsionAndRipplesScene

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
varying vec2 v_uvs;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D diffuse1;
uniform sampler2D diffuse2;
uniform sampler2D vignette;
uniform float u_distorsion_center;
uniform float u_distorsion_amount;
uniform float u_distorsion_speed;

float inverse_lerp(float v, float min_value, float max_value) {
    return (v - min_value) / (max_value - min_value);
}

float remap(float v, float in_min, float in_max, float out_min, float out_max) {
    float t = inverse_lerp(v, in_min, in_max);
    return mix(out_min, out_max, t);
}

vec3 saturate(vec3 x) {
    return clamp(x, vec3(0.0), vec3(1.0));
}

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

void main() {
    vec2 coords = fract(v_uvs * vec2(2.0, 1.0));
    coords.x = remap(coords.x, 0.0, 1.0, 0.25, 0.75);
    vec3 color = texture2D(diffuse2, coords).xyz;

    if (v_uvs.x > 0.5) {
        // Ripples
        float dist_to_center = length(coords - u_distorsion_center);
        float d = sin(dist_to_center * 50.0 - u_time * u_distorsion_speed);
        vec2 dir = normalize(coords - u_distorsion_center);
        vec2 ripple_coords = coords + d * dir * u_distorsion_amount;
        color = texture2D(diffuse2, ripple_coords).xyz;
    }

    gl_FragColor = vec4(color, 1.0);
}
`

class DistorsionAndRipplesScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    distorsion_center: 0.5,
    distorsion_amount: 0.05,
    distorsion_speed: 2.0,
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
    const loader = new THREE.TextureLoader()
    const dogTexture = loader.load('/textures/dog.jpg')
    const plantsTexture = loader.load('/textures/tomato.jpg')
    const vignetteTexture = loader.load('/textures/vignette.jpg')

    plantsTexture.wrapS = THREE.ClampToEdgeWrapping
    plantsTexture.wrapT = THREE.ClampToEdgeWrapping
    plantsTexture.magFilter = THREE.NearestFilter
    plantsTexture.minFilter = THREE.NearestFilter
    dogTexture.magFilter = THREE.NearestFilter
    dogTexture.minFilter = THREE.NearestFilter

    this.uniforms = {
      u_resolution: { value: new THREE.Vector2(window.innerWidth - 250, window.innerHeight) },
      u_time: { value: 0.0 },
      diffuse1: { value: dogTexture },
      diffuse2: { value: plantsTexture },
      vignette: { value: vignetteTexture },
      u_distorsion_center: { value: this.uiState.distorsion_center },
      u_distorsion_amount: { value: this.uiState.distorsion_amount },
      u_distorsion_speed: { value: this.uiState.distorsion_speed },
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

    this.uniforms.u_time.value = elapsedTime
    this.uniforms.u_distorsion_center.value = this.uiState.distorsion_center
    this.uniforms.u_distorsion_amount.value = this.uiState.distorsion_amount
    this.uniforms.u_distorsion_speed.value = this.uiState.distorsion_speed

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.add(this.uiState, 'distorsion_center', 0.0, 1.0, 0.001)
    this.gui.add(this.uiState, 'distorsion_amount', 0.01, 1.0, 0.001)
    this.gui.add(this.uiState, 'distorsion_speed', 1.0, 10.0, 0.01)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new DistorsionAndRipplesScene()
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
