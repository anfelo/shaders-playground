<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: BooleanOperationsScene

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

void main(){
    vec2 pixel_coords = (v_uvs - 0.5) * u_resolution;

    vec3 color = background_color();
    color = draw_grid(color, vec3(0.5), 10.0, 1.0);
    color = draw_grid(color, vec3(0.0), 100.0, 2.0);

    vec2 pos = pixel_coords;

    float box = sdf_box(rotate_2D(u_time * 0.5) * pos, vec2(200.0, 100.0));
    float d1 = sdf_circle(pos - vec2(-300.0, -150.0), 150.0);
    float d2 = sdf_circle(pos - vec2(300.0, -150.0), 150.0);
    float d3 = sdf_circle(pos - vec2(0.0, 200.0), 150.0);
    float d = op_union(op_union(d1, d2), d3);

    vec3 sdf_color = mix(u_color, BLUE, smoothstep(0.0, 1.0, soft_max_value(box, d, 0.01)));

    switch (u_operation) {
    case 0:
        d = op_union(box, d);
        break;
    case 1:
        d = op_intersection(box, d);
        break;
    case 2:
        d = op_subtraction(box, d);
        break;
    case 3:
        d = soft_min(box, d, 0.05);
        break;
    case 4:
        d = soft_max(box, d, 0.05);
        break;
    }

    color = mix(sdf_color * 0.5, color, smoothstep(-1.0, 1.0, d));
    color = mix(sdf_color, color, smoothstep(-5.0, 0.0, d));

    gl_FragColor = vec4(color, 1.0);
}
`

class BooleanOperationsScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_time: { value: 0.0 },
    u_color: [1.0, 0.25, 0.25],
    u_operation: 0,
    u_rot: 0.0,
    u_scale: 1.0,
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

    this.uniforms.u_color.value = this.uiState.u_color
    this.uniforms.u_operation.value = this.uiState.u_operation
    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
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

  scene = new BooleanOperationsScene()
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
