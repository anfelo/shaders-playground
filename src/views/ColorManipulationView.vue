<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: ColorManipulationScene

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
uniform vec3 u_tint_color;
uniform float u_brightness_amount;
uniform vec3 u_luminance_color;
uniform float u_saturation_amount;
uniform float u_contrast_amount;
uniform float u_contrast_midpoint;
uniform vec3 u_boost_color;
uniform bool u_boost_enabled;
uniform bool u_vignette_enabled;
uniform bool u_pixelated_enabled;
uniform float u_pixelated_res;

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
        // Tinting
        vec3 tint_color = u_tint_color;
        color *= tint_color;

        // Brightness
        float brightness_amount = u_brightness_amount;
        color += brightness_amount;

        // Saturation
        float luminance = dot(color, u_luminance_color);
        float saturation_amount = u_saturation_amount;
        color = mix(vec3(luminance), color, saturation_amount);

        // Contrast
        float contrast_amount = u_contrast_amount;
        float midpoint = u_contrast_midpoint;
        color = saturate((color - midpoint) * contrast_amount + midpoint);

        if (u_boost_enabled) {
            // Color Boost
            vec3 ref_color = u_boost_color;
            float color_weight = dot(normalize(color), normalize(ref_color));
            color_weight = pow(color_weight, 32.0);
            color = mix(vec3(luminance), color, color_weight);
        }

        if (u_vignette_enabled) {
            // Vignette
            vec2 vignette_coords = fract(v_uvs * vec2(2.0, 1.0));
            //vec3 vignette_amount = texture2D(vignette, vignette_coords).xyz;

            float v1 = smoothstep(0.5, 0.2, abs(vignette_coords.x - 0.5));
            float v2 = smoothstep(0.5, 0.2, abs(vignette_coords.y - 0.5));
            float vignette_amount = v1 * v2;
            vignette_amount = pow(vignette_amount, 0.25);
            vignette_amount = remap(vignette_amount, 0.0, 1.0, 0.5, 1.0);

            color *= vignette_amount;
        }

        if (u_pixelated_enabled) {
            // Pixelated
            vec2 dims = vec2(u_pixelated_res);
            vec2 tex_uv = floor(coords * dims) / dims;
            vec3 pixelated = texture2D(diffuse2, tex_uv).xyz;
            color = pixelated;
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`

class ColorManipulationScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    tint_color: [1.0, 1.0, 1.0],
    brightness_amount: 0.1,
    luminance_color: [0.2126, 0.7152, 0.0722],
    saturation_amount: 0.5,
    contrast_amount: 2.0,
    contrast_midpoint: 0.5,
    boost_enabled: false,
    boost_color: [0.72, 0.25, 0.25],
    vignette_enabled: false,
    pixelated_enabled: false,
    pixelated_res: 64.0,
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
      u_resolution: { value: new THREE.Vector2(this.width, this.height) },
      u_time: { value: 0.0 },
      diffuse1: { value: dogTexture },
      diffuse2: { value: plantsTexture },
      vignette: { value: vignetteTexture },
      u_tint_color: { value: this.uiState.tint_color },
      u_brightness_amount: { value: this.uiState.brightness_amount },
      u_luminance_color: { value: this.uiState.luminance_color },
      u_saturation_amount: { value: this.uiState.saturation_amount },
      u_contrast_amount: { value: this.uiState.contrast_amount },
      u_contrast_midpoint: { value: this.uiState.contrast_midpoint },
      u_boost_color: { value: this.uiState.boost_color },
      u_boost_enabled: { value: this.uiState.boost_enabled },
      u_vignette_enabled: { value: this.uiState.vignette_enabled },
      u_pixelated_enabled: { value: this.uiState.pixelated_enabled },
      u_pixelated_res: { value: this.uiState.pixelated_res },
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
    this.uniforms.u_tint_color.value = this.uiState.tint_color
    this.uniforms.u_brightness_amount.value = this.uiState.brightness_amount
    this.uniforms.u_luminance_color.value = this.uiState.luminance_color
    this.uniforms.u_saturation_amount.value = this.uiState.saturation_amount
    this.uniforms.u_contrast_amount.value = this.uiState.contrast_amount
    this.uniforms.u_contrast_midpoint.value = this.uiState.contrast_midpoint
    this.uniforms.u_boost_color.value = this.uiState.boost_color
    this.uniforms.u_boost_enabled.value = this.uiState.boost_enabled
    this.uniforms.u_vignette_enabled.value = this.uiState.vignette_enabled
    this.uniforms.u_pixelated_enabled.value = this.uiState.pixelated_enabled
    this.uniforms.u_pixelated_res.value = this.uiState.pixelated_res

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    const tinting = this.gui.addFolder('Tinting')
    tinting.addColor(this.uiState, 'tint_color')

    const brightness = this.gui.addFolder('Brightness')
    brightness.add(this.uiState, 'brightness_amount', 0.1, 0.4, 0.001)

    const saturation = this.gui.addFolder('Saturation')
    saturation.addColor(this.uiState, 'luminance_color')
    saturation.add(this.uiState, 'saturation_amount', 0.0, 1.0, 0.001)

    const contrast = this.gui.addFolder('Contrast')
    contrast.add(this.uiState, 'contrast_amount', 0.1, 5.0, 0.001)
    contrast.add(this.uiState, 'contrast_midpoint', 0.0, 1.0, 0.001)

    const boost_color = this.gui.addFolder('Color Boost')
    boost_color.add(this.uiState, 'boost_enabled')
    boost_color.addColor(this.uiState, 'boost_color')

    const vignette = this.gui.addFolder('Vignette')
    vignette.add(this.uiState, 'vignette_enabled')

    const pixelated = this.gui.addFolder('Pixelated')
    pixelated.add(this.uiState, 'pixelated_enabled')
    pixelated.add(this.uiState, 'pixelated_res', 4.0, 512.0, 1.0)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new ColorManipulationScene()
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
