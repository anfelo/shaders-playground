<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: CloudyDayScene

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
uniform float u_time;
uniform int u_operation;

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
    return mix(
        vec3(0.42, 0.58, 0.75),
        vec3(0.36, 0.46, 0.82),
        smoothstep(0.0, 1.0, pow(v_uvs.x * v_uvs.y, 0.5))
    );
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

mat2 rotate_2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);

    return mat2(c, -s, s, c);
}

float op_union(float d1, float d2) {
    return min(d1, d2);
}

float op_intersection(float d1, float d2) {
    return max(d1, d2);
}

float op_subtraction(float d1, float d2) {
    return max(-d1, d2);
}

float soft_max(float a, float b, float k) {
    return log(exp(k * a) + exp(k * b)) / k;
}

float soft_min(float a, float b, float k) {
    return -soft_max(-a, -b, k);
}

float soft_min_value(float a, float b, float k) {
    float h = remap(a - b, -1.0 / k, 1.0 / k, 0.0, 1.0);
    return h;
}

float soft_max_value(float a, float b, float k) {
    float h = exp(-b * k) / (exp(-a * k) + exp(-b * k));
    return h;
}

float sdf_cloud(vec2 pixel_coords) {
    float puff1 = sdf_circle(pixel_coords, 100.0);
    float puff2 = sdf_circle(pixel_coords - vec2(120.0, -10.0), 75.0);
    float puff3 = sdf_circle(pixel_coords + vec2(120.0, 10.0), 75.0);

    return op_union(puff1, op_union(puff2, puff3));
}

void main(){
    vec2 pixel_coords = (v_uvs - 0.5) * u_resolution;

    vec3 color = background_color();

    float cloud_shadow = sdf_cloud(pixel_coords + vec2(25.0)) - 40.0;
    float cloud = sdf_cloud(pixel_coords);
    color = mix(color, vec3(0.0), 0.5 * smoothstep(0.0, -100.0, cloud_shadow));
    color = mix(vec3(1.0), color, smoothstep(0.0, 1.0, cloud));

    gl_FragColor = vec4(color, 1.0);
}
`

class CloudyDayScene implements Scene {
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
    u_color: [1.0, 0.25, 0.25],
    u_operation: 0,
    u_rot: 0.0,
    u_scale: 1.0,
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
      u_scale: { value: this.uiState.u_scale },
      u_time: { value: this.uiState.u_time },
      u_operation: { value: this.uiState.u_operation },
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
    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_operation.value = this.uiState.u_operation
    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
  }

  private initDebugUI() {
    this.gui.addColor(this.uiState, 'u_color')
    this.gui.add(this.uiState, 'u_operation', {
      Union: 0,
      Intersection: 1,
      Substraction: 2,
      SoftMin: 3,
      softMax: 4,
    })
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new CloudyDayScene()
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
