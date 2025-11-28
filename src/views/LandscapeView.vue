<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: LandscapeScene

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

varying vec2 v_uvs;

float inverse_lerp(float v, float min_value, float max_value) {
    return (v - min_value) / (max_value - min_value);
}

float remap(float v, float in_min, float in_max, float out_min, float out_max) {
    float t = inverse_lerp(v, in_min, in_max);
    return mix(out_min, out_max, t);
}

vec3 hash(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));

    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise(in vec3 p) {
    vec3 i = floor( p );
    vec3 f = fract( p );

    vec3 u = f*f*(3.0-2.0*f);

    return mix( mix( mix( dot( hash( i + vec3(0.0,0.0,0.0) ), f - vec3(0.0,0.0,0.0) ),
                          dot( hash( i + vec3(1.0,0.0,0.0) ), f - vec3(1.0,0.0,0.0) ), u.x),
                     mix( dot( hash( i + vec3(0.0,1.0,0.0) ), f - vec3(0.0,1.0,0.0) ),
                          dot( hash( i + vec3(1.0,1.0,0.0) ), f - vec3(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hash( i + vec3(0.0,0.0,1.0) ), f - vec3(0.0,0.0,1.0) ),
                          dot( hash( i + vec3(1.0,0.0,1.0) ), f - vec3(1.0,0.0,1.0) ), u.x),
                     mix( dot( hash( i + vec3(0.0,1.0,1.0) ), f - vec3(0.0,1.0,1.0) ),
                          dot( hash( i + vec3(1.0,1.0,1.0) ), f - vec3(1.0,1.0,1.0) ), u.x), u.y), u.z );
}

float fbm(vec3 p, int octaves, float persistence, float lacunarity) {
  float amplitude = 0.5;
  float frequency = 1.0;
  float total = 0.0;
  float normalization = 0.0;

  for (int i = 0; i < octaves; ++i) {
    float noiseValue = noise(p * frequency);
    total += noiseValue * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  total /= normalization;

  return total;
}

float ridged_fbm(vec3 p, int octaves, float persistence, float lacunarity) {
    float amplitude = 0.5;
    float frequency = 1.0;
    float total = 0.0;
    float normalization = 0.0;

    for (int i = 0; i < octaves; ++i) {
      float noiseValue = noise(p * frequency);
      noiseValue = abs(noiseValue);
      noiseValue = 1.0 - noiseValue;

      total += noiseValue * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    total /= normalization;
    total *= total;

    return total;
}

vec3 generate_sky() {
    vec3 color1 = vec3(0.4, 0.6, 0.9);
    vec3 color2 = vec3(0.1, 0.15, 0.4);

    return mix(color1, color2, smoothstep(0.875, 1.0, v_uvs.y));
}

vec3 draw_mountains(vec3 background, vec3 mountain_color, vec2 pixel_coords, float depth) {
    float y = fbm(vec3(depth + pixel_coords.x / 256.0, 1.432, 3.643), 6, 0.5, 2.0) * 256.0;

    vec3 fog_color = vec3(0.4, 0.6, 0.9);
    float fog_factor = smoothstep(0.0, 8000.0, depth) * 0.5;

    float height_factor = smoothstep(256.0, -512.0, pixel_coords.y);
    height_factor *= height_factor;
    fog_factor = mix(height_factor, fog_factor, fog_factor);

    mountain_color = mix(mountain_color, fog_color, fog_factor);

    float sdf_mountain = pixel_coords.y - y;

    float blur = 1.0 + smoothstep(200.0, 6000.0, depth) * 128.0 + smoothstep(200.0, -1400.0, depth) *
    128.0;
    vec3 color = mix(mountain_color, background, smoothstep(0.0, blur, sdf_mountain));

    return color;
}

void main() {
    vec2 pixel_coords = (v_uvs - 0.5) * u_resolution;
    vec3 color = generate_sky();

    vec2 time_offset = vec2(u_time * 50.0, 0.0);
    vec2 mountain_coords = (pixel_coords - vec2(0.0, 400.0)) * 8.0 + time_offset;
    color = draw_mountains(color, vec3(0.5), mountain_coords, 6000.0);

    mountain_coords = (pixel_coords - vec2(0.0, 360.0)) * 4.0 + time_offset;
    color = draw_mountains(color, vec3(0.45), mountain_coords, 3200.0);

    mountain_coords = (pixel_coords - vec2(0.0, 280.0)) * 2.0 + time_offset;
    color = draw_mountains(color, vec3(0.4), mountain_coords, 1600.0);

    mountain_coords = (pixel_coords - vec2(0.0, 150.0)) * 1.0 + time_offset;
    color = draw_mountains(color, vec3(0.35), mountain_coords, 800.0);

    mountain_coords = (pixel_coords - vec2(0.0, -100.0)) * 0.5 + time_offset;
    color = draw_mountains(color, vec3(0.3), mountain_coords, 400.0);

    mountain_coords = (pixel_coords - vec2(0.0, -500.0)) * 0.25 + time_offset;
    color = draw_mountains(color, vec3(0.25), mountain_coords, 200.0);

    mountain_coords = (pixel_coords - vec2(0.0, -1400.0)) * 0.125 + time_offset;
    color = draw_mountains(color, vec3(0.2), mountain_coords, 100.0);

    gl_FragColor = vec4(color, 1.0);
}
`

class LandscapeScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    time: { value: 0.0 },
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
      u_time: { value: this.uiState.time },
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

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {}
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new LandscapeScene()
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
