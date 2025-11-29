<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: PerlinAndSimplexScene

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
uniform int u_noise_type;
uniform bool u_stepped;
uniform int u_octaves;
uniform float u_persistence;
uniform float u_lacunarity;

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

float turbulence_fbm(vec3 p, int octaves, float persistence, float lacunarity) {
    float amplitude = 0.5;
    float frequency = 1.0;
    float total = 0.0;
    float normalization = 0.0;

    for (int i = 0; i < octaves; ++i) {
      float noiseValue = noise(p * frequency);
      noiseValue = abs(noiseValue);

      total += noiseValue * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    total /= normalization;

    return total;
}

float cellular(vec3 coords) {
    vec2 gridBasePosition = floor(coords.xy);
    vec2 gridCoordOffset = fract(coords.xy);

    float closest = 1.0;
    for (float y = -2.0; y <= 2.0; y += 1.0) {
      for (float x = -2.0; x <= 2.0; x += 1.0) {
        vec2 neighbourCellPosition = vec2(x, y);
        vec2 cellWorldPosition = gridBasePosition + neighbourCellPosition;
        vec2 cellOffset = vec2(
          noise(vec3(cellWorldPosition, coords.z) + vec3(243.432, 324.235, 0.0)),
          noise(vec3(cellWorldPosition, coords.z))
        );

        float distToNeighbour = length(
            neighbourCellPosition + cellOffset - gridCoordOffset);
        closest = min(closest, distToNeighbour);
      }
    }

    return closest;
}

float stepped(float noise_sample) {
    float stepped_sample = floor(noise_sample * 10.0) / 10.0;
    float remainder = fract(noise_sample * 10.0);
    stepped_sample = (stepped_sample - remainder) * 0.5 + 0.5;
    return stepped_sample;
}

float domain_warping_fbm(vec3 coords) {
    vec3 offset = vec3(
        fbm(coords, 4, 0.5, 2.0),
        fbm(coords + vec3(43.235, 23.112, 0.0), 4, 0.5, 2.0), 0.0);
    float noise_sample = fbm(coords + offset, 1, 0.5, 2.0);

    vec3 offset2 = vec3(
        fbm(coords + 4.0 * offset + vec3(5.325, 1.421, 3.235), 4, 0.5, 2.0),
        fbm(coords + 4.0 * offset + vec3(4.32, 0.532, 6.324), 4, 0.5, 2.0), 0.0);
    noise_sample = fbm(coords + 4.0 * offset2, 1, 0.5, 2.0);

    return noise_sample;
}

void main() {
    vec3 coords = vec3(v_uvs * 10.0, u_time * 0.2);
    coords.x *= u_resolution.x/u_resolution.y;

    float noise_sample = 0.0;

    switch (u_noise_type) {
    case 0:
        noise_sample = remap(noise(coords), -1.0, 1.0, 0.0, 1.0);
        break;
    case 1:
        noise_sample = remap(fbm(coords, u_octaves, u_persistence, u_lacunarity), -1.0, 1.0, 0.0, 1.0);
        break;
    case 2:
        noise_sample = ridged_fbm(coords, u_octaves, u_persistence, u_lacunarity);
        break;
    case 3:
        noise_sample = turbulence_fbm(coords, u_octaves, u_persistence, u_lacunarity);
        break;
    case 4:
        noise_sample = 1.0 - cellular(coords);
        break;
    case 5:
        noise_sample = remap(domain_warping_fbm(coords), -1.0, 1.0, 0.0, 1.0);
        break;
    }

    if (u_stepped) {
        noise_sample = stepped(noise_sample);
    }

    vec3 color = vec3(noise_sample);

    gl_FragColor = vec4(color, 1.0);
}
`

class PerlinAndSimplexScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    time: { value: 0.0 },
    octaves: 16,
    persistence: 0.5,
    lacunarity: 2.0,
    noise_type: 0,
    stepped: false,
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
      u_resolution: { value: [this.width, this.height] },
      u_noise_type: { value: this.uiState.noise_type },
      u_stepped: { value: this.uiState.stepped },
      u_time: { value: this.uiState.time },
      u_octaves: { value: this.uiState.octaves },
      u_persistence: { value: this.uiState.persistence },
      u_lacunarity: { value: this.uiState.lacunarity },
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
    this.uniforms.u_noise_type.value = this.uiState.noise_type
    this.uniforms.u_stepped.value = this.uiState.stepped
    this.uniforms.u_octaves.value = this.uiState.octaves
    this.uniforms.u_persistence.value = this.uiState.persistence
    this.uniforms.u_lacunarity.value = this.uiState.lacunarity

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    const general_folder = this.gui.addFolder('General')
    general_folder.add(this.uiState, 'noise_type', {
      SimpleNoise: 0,
      FBM: 1,
      RidgeFBM: 2,
      TurbulenceFBM: 3,
      Cellular: 4,
      DomainWrappingFBM: 5,
    })
    general_folder.add(this.uiState, 'stepped')

    const fbm_folder = this.gui.addFolder('fbm')
    fbm_folder.add(this.uiState, 'octaves', 1, 20, 1)
    fbm_folder.add(this.uiState, 'persistence', 0.1, 1.0, 0.001)
    fbm_folder.add(this.uiState, 'lacunarity', 1.0, 10.0, 0.001)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new PerlinAndSimplexScene()
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
