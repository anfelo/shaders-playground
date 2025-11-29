<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

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
uniform vec2 u_pos;
uniform vec3 u_color;
uniform int u_shape;
uniform float u_rot;
uniform float u_scale;

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

void main(){
    vec2 pixel_coords = (v_uvs - 0.5) * u_resolution;

    vec3 color = background_color();
    color = draw_grid(color, vec3(0.5), 10.0, 1.0);
    color = draw_grid(color, vec3(0.0), 100.0, 2.0);

    float d = 0.0;

    vec2 pos = pixel_coords;
    // Transformations: Got to apply the inverse transformation to get the shape
    // to the place that we want it to be.
    pos -= u_pos;
    pos *= rotate_2D(u_rot);

    switch (u_shape) {
    // Line
    case 0:
        d = sdf_line(pos, vec2(-100.0, -50.0) * u_scale, vec2(200.0, -75.0) * u_scale);
        color = mix(u_color, color, step(5.0, d));
        break;
    // Circle
    case 1:
        d = sdf_circle(pos, 100.0 * u_scale);
        color = mix(u_color * 0.5, color, smoothstep(-1.0, 1.0, d));
        color = mix(u_color, color, smoothstep(-5.0, 0.0, d));
        break;
    // Box
    case 2:
        d = sdf_box(pos, vec2(300.0, 100.0) * u_scale);
        color = mix(u_color * 0.5, color, smoothstep(-1.0, 1.0, d));
        color = mix(u_color, color, smoothstep(-5.0, 0.0, d));
        break;
    // Hexagon
    case 3:
        d = sdf_hexagon(pos, 300.0 * u_scale);
        color = mix(u_color * 0.5, color, smoothstep(-1.0, 1.0, d));
        color = mix(u_color, color, smoothstep(-5.0, 0.0, d));
        break;
    }

    gl_FragColor = vec4(color, 1.0);
}
`

class SimpleShapesScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_color: [1.0, 0.0, 0.0],
    u_shape: 1,
    u_pos_x: 0.0,
    u_pos_y: 0.0,
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
      u_shape: { value: this.uiState.u_shape },
      u_pos: { value: [this.uiState.u_pos_x, this.uiState.u_pos_y] },
      u_rot: { value: this.uiState.u_rot },
      u_scale: { value: this.uiState.u_scale },
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
    this.uniforms.u_shape.value = this.uiState.u_shape
    this.uniforms.u_pos.value = [this.uiState.u_pos_x, this.uiState.u_pos_y]
    this.uniforms.u_rot.value = (this.uiState.u_rot * Math.PI) / 180
    this.uniforms.u_scale.value = this.uiState.u_scale

    this.renderer.render(this.scene, this.camera)
  }

  private initDebugUI() {
    this.gui.addColor(this.uiState, 'u_color')
    this.gui.add(this.uiState, 'u_shape', { Line: 0, Circle: 1, Box: 2, Hexagon: 3 })

    const posFolder = this.gui.addFolder('Position')
    posFolder.add(this.uiState, 'u_pos_x', -300.0, 300, 0.01)
    posFolder.add(this.uiState, 'u_pos_y', -300.0, 300, 0.01)

    const rotFolder = this.gui.addFolder('Rotation')
    rotFolder.add(this.uiState, 'u_rot', 0, 360, 0.01)

    const scaleFolder = this.gui.addFolder('Scale')
    scaleFolder.add(this.uiState, 'u_scale', 1, 10, 0.01)
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
