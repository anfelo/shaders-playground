<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: SphereTracingScene

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

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

mat3 rotate_y(float radians) {
  float s = sin(radians);
  float c = cos(radians);
  return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c);
}

mat3 rotate_x(float radians) {
  float s = sin(radians);
  float c = cos(radians);
  return mat3(
      1.0, 0.0, 0.0,
      0.0, c, -s,
      0.0, s, c);
}

float sdf_sphere(vec3 p, float r) {
    return length(p) - r;
}

float sdf_box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdf_torus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz)-t.x, p.y);
    return length(q)-t.y;
}

float sdf_plane(vec3 pos) {
    return pos.y;
}

struct MaterialData {
    vec3 color;
    float dist;
};

vec3 RED = vec3(1.0, 0.0, 0.0);
vec3 GREEN = vec3(0.0, 1.0, 0.0);
vec3 BLUE = vec3(0.0, 0.0, 1.0);
vec3 GRAY = vec3(0.5);
vec3 WHITE = vec3(1.0);

// The map function calculates the overall SDF.
// Maybe a better name would be calculate_scene_SDF
MaterialData map(vec3 pos) {
    MaterialData result = MaterialData(GRAY, sdf_plane(pos - vec3(0.0, -2.0, 0.0)));

    float dist = sdf_box(pos - vec3(-2.0, -0.85, 5.0), vec3(1.0));
    result.color = dist < result.dist ? RED : result.color;
    result.dist = min(result.dist, dist);

    dist = sdf_box(pos - vec3(2.0, -0.85, 5.0), vec3(1.0));
    result.color = dist < result.dist ? BLUE : result.color;
    result.dist = min(result.dist, dist);

    dist = sdf_box(pos - vec3(2.0, 1.0, 50.0 + sin(u_time) * 25.0), vec3(2.0));
    result.color = dist < result.dist ? BLUE : result.color;
    result.dist = min(result.dist, dist);

    return result;
}

vec3 calculate_normal(vec3 pos) {
  const float e = 0.0001;
  vec3 n = vec3(
      map(pos + vec3(e, 0.0, 0.0)).dist - map(pos - vec3(e, 0.0, 0.0)).dist,
      map(pos + vec3(0.0, e, 0.0)).dist - map(pos - vec3(0.0, e, 0.0)).dist,
      map(pos + vec3(0.0, 0.0, e)).dist - map(pos - vec3(0.0, 0.0, e)).dist
  );

  return normalize(n);
}

vec3 calculate_lighting(vec3 pos, vec3 normal, vec3 light_color, vec3 light_dir,
                        vec3 camera_dir) {
    float dp = saturate(dot(normal, light_dir));

    vec3 ambient = vec3(0.002);
    vec3 diffuse = light_color * dp;

    vec2 spec_params = vec2(0.5, 32.0);
    vec3 r = normalize(reflect(-light_dir, normal));
    float phong_value = max(0.0, dot(camera_dir, r));
    phong_value = pow(phong_value, spec_params.y);

    vec3 specular = vec3(phong_value) * spec_params.x * diffuse;

    vec3 lighting = diffuse + ambient + specular;

    return lighting;
}

float calculate_shadows(vec3 pos, vec3 light_dir) {
    float d = 0.01;
    for(int i = 0; i < 64; ++i) {
        float dist_to_scene = map(pos + light_dir * d).dist;

        if (dist_to_scene < 0.001) {
            return 0.0;
        }

        d += dist_to_scene;
    }

    return 1.0;
}

float calculate_AO(vec3 pos, vec3 normal) {
    float ao = 0.0;
    float step_size = 0.1;

    for(float i = 0.0; i < 5.0; ++i) {
        float dist_factor = 1.0 / pow(2.0, i);

        ao += dist_factor * (i * step_size - map(pos + normal * i * step_size).dist);
    }

    return 1.0 - ao;
}

const int NUM_STEPS = 256;
const float MAX_DIST = 1000.0;

// Performs sphere tracing for the scene
vec3 ray_march(vec3 camera_origin, vec3 camera_dir) {
    vec3 pos;
    MaterialData material = MaterialData(vec3(0.0), 0.0);

    vec3 sky_color = vec3(0.55, 0.6, 1.0);

    for (int i = 0; i < NUM_STEPS; ++i) {
        pos = camera_origin + material.dist * camera_dir;

        MaterialData result = map(pos);

        // Case 1: dist_to_scene < 0, intersected scene
        if (result.dist < 0.001) {
            break;
        }
        material.dist += result.dist;
        material.color = result.color;

        // Case 2: dist > MAX_DIST, out of the scene entirely
        if (material.dist > MAX_DIST) {
            return sky_color;
        }

        // Case 3: Loop around, do nothing
    }

    vec3 light_dir = normalize(vec3(1.0, 2.0, -1.0));
    vec3 light_color = WHITE;
    vec3 normal = calculate_normal(pos);
    float shadowed = calculate_shadows(pos, light_dir);
    vec3 lighting = calculate_lighting(pos, normal, light_color, light_dir, camera_dir);
    lighting *= shadowed;
    vec3 color = material.color * lighting;

    float fog_factor = 1.0 - exp(-pos.z * 0.01);
    color = mix(color, sky_color, fog_factor);

    //float ao = calculate_AO(pos, normal);
    //return vec3(ao);

    return color;
}

void main() {
    vec2 pixel_coords = vec2(v_uvs - 0.5) * u_resolution;

    vec3 ray_dir = normalize(vec3(pixel_coords * 2.0 / u_resolution.y, 1.0));
    vec3 ray_origin = vec3(0.0);

    vec3 color = ray_march(ray_origin, ray_dir);

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

class SphereTracingScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    time: { value: 0.0 },
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

  scene = new SphereTracingScene()
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
