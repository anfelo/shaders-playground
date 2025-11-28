<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: TerrainScene

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

// The MIT License
// Copyright © 2013 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// https://www.youtube.com/c/InigoQuilez
// https://iquilezles.org/
//
// https://www.shadertoy.com/view/lsf3WH
// SimonDev: Renamed function to "Math_Random" from "hash"
float Math_Random(vec2 p)  // replace this by something better
{
  p  = 50.0*fract( p*0.3183099 + vec2(0.71,0.113));
  return -1.0+2.0*fract( p.x*p.y*(p.x+p.y) );
}

float noise(vec2 coords) {
  vec2 texSize = vec2(1.0);
  vec2 pc = coords * texSize;
  vec2 base = floor(pc);

  float s1 = Math_Random((base + vec2(0.0, 0.0)) / texSize);
  float s2 = Math_Random((base + vec2(1.0, 0.0)) / texSize);
  float s3 = Math_Random((base + vec2(0.0, 1.0)) / texSize);
  float s4 = Math_Random((base + vec2(1.0, 1.0)) / texSize);

  vec2 f = smoothstep(0.0, 1.0, fract(pc));

  float px1 = mix(s1, s2, f.x);
  float px2 = mix(s3, s4, f.x);
  float result = mix(px1, px2, f.y);
  return result;
}

float noiseFBM(vec2 p, int octaves, float persistence, float lacunarity) {
  float amplitude = 0.5;
  float total = 0.0;

  for (int i = 0; i < octaves; ++i) {
    float noiseValue = noise(p);
    total += noiseValue * amplitude;
    amplitude *= persistence;
    p = p * lacunarity;
  }

  return total;
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

MaterialData op_u(MaterialData a, MaterialData b) {
    if (a.dist < b.dist) {
        return a;
    }

    return b;
}

// The map function calculates the overall SDF.
// Maybe a better name would be calculate_scene_SDF
MaterialData map(vec3 pos) {
    float cur_noise_sample = noiseFBM(pos.xz / 2.0, 1, 0.5, 2.0);
    cur_noise_sample = abs(cur_noise_sample);
    cur_noise_sample *= 1.5;
    cur_noise_sample += 0.1 * noiseFBM(pos.xz * 4.0, 6, 0.5, 2.0);

    float WATER_LEVEL = 0.45;
    vec3 land_color = vec3(0.498, 0.435, 0.396);
    land_color = mix(land_color, land_color * 0.25, smoothstep(WATER_LEVEL - 0.1, WATER_LEVEL,
                     cur_noise_sample));
    MaterialData result = MaterialData(land_color, pos.y + cur_noise_sample);

    vec3 shallow_color = vec3(0.25, 0.25, 0.75);
    vec3 deep_color = vec3(0.025, 0.025, 0.15);
    vec3 water_color = mix(shallow_color, deep_color, smoothstep(WATER_LEVEL, WATER_LEVEL + 0.1,
                           cur_noise_sample));
    water_color = mix(water_color, WHITE, smoothstep(WATER_LEVEL + 0.0125, WATER_LEVEL, cur_noise_sample));

    MaterialData water_material = MaterialData(water_color, pos.y + WATER_LEVEL);

    result = op_u(result, water_material);

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

const int NUM_STEPS = 256;
const float MAX_DIST = 1000.0;
const float MIN_DIST = 0.00001;

MaterialData ray_cast(vec3 camera_origin, vec3 camera_dir, int num_steps,
                      float start_dist, float max_dist) {
    MaterialData material = MaterialData(vec3(0.0), start_dist);
    MaterialData default_material = MaterialData(vec3(0.0), -1.0);

    for (int i = 0; i < NUM_STEPS; ++i) {
        vec3 pos = camera_origin + material.dist * camera_dir;

        MaterialData result = map(pos);

        // Case 1: dist_to_scene < 0, intersected scene
        if (abs(result.dist) < MIN_DIST * material.dist) {
            break;
        }
        material.dist += result.dist;
        material.color = result.color;

        // Case 2: dist > MAX_DIST, out of the scene entirely
        if (material.dist > max_dist) {
            return default_material;
        }

        // Case 3: Loop around, do nothing
    }

    return material;
}

float calculate_shadows(vec3 pos, vec3 light_dir) {
    MaterialData result = ray_cast(pos, light_dir, 64, 0.01, 10.0);

    if (result.dist >= 0.0) {
        return 0.0;
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

// Performs sphere tracing for the scene
vec3 ray_march(vec3 camera_origin, vec3 camera_dir) {
    MaterialData material = ray_cast(camera_origin, camera_dir, NUM_STEPS, 1.0, MAX_DIST);

    vec3 light_dir = normalize(vec3(-0.5, 0.2, -0.6));
    float sky_t = exp(saturate(camera_dir.y) * -40.0);
    float sun_factor = pow(saturate(dot(light_dir, camera_dir)), 8.0);
    vec3 sky_color = mix(vec3(0.025, 0.065, 0.5), vec3(0.4, 0.5, 1.0), sky_t);
    vec3 fog_color = mix(sky_color, vec3(1.0, 0.9, 0.65), sun_factor);
    if (material.dist < 0.0) {
        return fog_color;
    }

    vec3 pos = camera_origin + material.dist * camera_dir;

    vec3 light_color = WHITE;
    vec3 normal = calculate_normal(pos);
    float shadowed = calculate_shadows(pos, light_dir);
    vec3 lighting = calculate_lighting(pos, normal, light_color, light_dir, camera_dir);
    lighting *= shadowed;
    vec3 color = material.color * lighting;

    float fog_dist = distance(camera_origin, pos);
    float inscatter = 1.0 - exp(-fog_dist * fog_dist * mix(0.0005, 0.001, sun_factor));
    float extinction = exp(-fog_dist * fog_dist * 0.01);

    color = color * extinction + fog_color * inscatter;

    //float ao = calculate_AO(pos, normal);
    //return vec3(ao);

    return color;
}

mat3 make_camera_matrix(vec3 camera_origin, vec3 camera_look_at, vec3 camera_up) {
    vec3 z = normalize(camera_look_at - camera_origin);
    vec3 x = normalize(cross(z, camera_up));
    vec3 y = cross(x, z);
    return mat3(x, y, z);
}

void main() {
    vec2 pixel_coords = vec2(v_uvs - 0.5) * u_resolution;

    float t = u_time * 0.0;
    vec3 ray_dir = normalize(vec3(pixel_coords * 2.0 / u_resolution.y, 1.0));
    vec3 ray_origin = vec3(3.0, 0.75, -3.0) * vec3(cos(t), 1.0, sin(t));
    vec3 ray_look_at = vec3(0.0);
    mat3 camera = make_camera_matrix(ray_origin, ray_look_at, vec3(0.0, 1.0, 0.0));

    vec3 color = ray_march(ray_origin, camera * ray_dir);

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

class TerrainScene extends Scene {
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

  scene = new TerrainScene()
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
