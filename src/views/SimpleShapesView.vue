<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: SimpleShapesScene

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
uniform vec3 u_color;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

vec3 BLACK = vec3(0.0, 0.0, 0.0);
vec3 YELLOW = vec3(1.0, 1.0, 0.5);
vec3 BLUE = vec3(0.25, 0.25, 1.0);
vec3 RED = vec3(1.0, 0.25, 0.25);
vec3 GREEN = vec3(0.25, 1.0, 0.25);
vec3 PURPLE = vec3(1.0, 0.25, 1.0);

float inverse_lerp(float v, float min_value, float max_value) {
    return (v - min_value) / (max_value - min_value);
}

float remap(float v, float in_min, float in_max, float out_min, float out_max) {
    float t = inverse_lerp(v, in_min, in_max);
    return mix(out_min, out_max, t);
}

vec3 background_color() {
    float dist_from_center = length(abs(v_uvs - 0.5));
    float vignette = 1.0 - dist_from_center;
    vignette = smoothstep(0.0, 0.7, vignette);
    vignette = remap(vignette, 0.0, 1.0, 0.3, 1.0);

    return vec3(vignette);
}

vec3 draw_grid(vec3 color, vec3 line_color, float cell_spacing, float line_width) {
    vec2 center = v_uvs - 0.5;
    vec2 cells = abs(fract(center * u_resolution / cell_spacing) - 0.5);
    float dist_to_edge = (0.5 - max(cells.x, cells.y)) * cell_spacing;
    float lines = smoothstep(0.0, line_width, dist_to_edge);

    color = mix(line_color, color, lines);

    return color;
}

float sdf_circle(vec2 p, float r) {
    return length(p) - r;
}

float sdf_line(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);

    return length(pa - ba * h);
}

float sdf_box(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;

    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Inigo Quilez
// https://iquilezles.org/articles/distfunctions2d/
float sdf_hexagon(in vec2 p,in float r ) {
    const vec3 k = vec3(-0.866025404,0.5,0.577350269);
    p = abs(p);
    p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
    p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);

    return length(p)*sign(p.y);
}

void main(){
    vec2 pixel_coords = (v_uvs - 0.5) * u_resolution;

    vec3 color = background_color();
    color = draw_grid(color, vec3(0.5), 10.0, 1.0);
    color = draw_grid(color, vec3(0.0), 100.0, 2.0);

    // Circle
    //float d = sdf_circle(pixel_coords, 100.0);
    //color = mix(RED, color, step(0.0, d));

    // Line
    //float d = sdf_line(pixel_coords, vec2(-100.0, -50.0), vec2(200.0, -75.0));
    //color = mix(RED, color, step(5.0, d));

    // Box
    // float d = sdf_box(pixel_coords, vec2(300.0, 100.0));
    // color = mix(RED, color, step(0.0, d));

    // Hexagon
    float d = sdf_hexagon(pixel_coords, 300.0);
    color = mix(RED, color, step(0.0, d));

    gl_FragColor = vec4(color, 1.0);
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

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
  }

  private initDebugUI() {
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
