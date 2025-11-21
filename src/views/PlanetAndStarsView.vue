<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { type Scene } from '@/types/scene'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: PlanetAndStarsScene

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

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

// Copyright (C) 2011 by Ashima Arts (Simplex noise)
// Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// https://github.com/ashima/webgl-noise/tree/master/src
vec3 mod289(vec3 x)
{
    return x - floor(x / 289.0) * 289.0;
}

vec4 mod289(vec4 x)
{
    return x - floor(x / 289.0) * 289.0;
}

vec4 permute(vec4 x)
{
    return mod289((x * 34.0 + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r)
{
    return 1.79284291400159 - r * 0.85373472095314;
}

vec4 snoise(vec3 v)
{
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);

    // First corner
    vec3 i  = floor(v + dot(v, vec3(C.y)));
    vec3 x0 = v   - i + dot(i, vec3(C.x));

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.x;
    vec3 x2 = x0 - i2 + C.y;
    vec3 x3 = x0 - 0.5;

    // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec4 p =
      permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // Gradients: 7x7 points over a square, mapped onto an octahedron.
    // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
    vec4 j = p - 49.0 * floor(p / 49.0);  // mod(p,7*7)

    vec4 x_ = floor(j / 7.0);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = (x_ * 2.0 + 0.5) / 7.0 - 1.0;
    vec4 y = (y_ * 2.0 + 0.5) / 7.0 - 1.0;

    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 g0 = vec3(a0.xy, h.x);
    vec3 g1 = vec3(a0.zw, h.y);
    vec3 g2 = vec3(a1.xy, h.z);
    vec3 g3 = vec3(a1.zw, h.w);

    // Normalize gradients
    vec4 norm = taylorInvSqrt(vec4(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(g3, g3)));
    g0 *= norm.x;
    g1 *= norm.y;
    g2 *= norm.z;
    g3 *= norm.w;

    // Compute noise and gradient at P
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    vec4 m2 = m * m;
    vec4 m3 = m2 * m;
    vec4 m4 = m2 * m2;
    vec3 grad =
      -6.0 * m3.x * x0 * dot(x0, g0) + m4.x * g0 +
      -6.0 * m3.y * x1 * dot(x1, g1) + m4.y * g1 +
      -6.0 * m3.z * x2 * dot(x2, g2) + m4.z * g2 +
      -6.0 * m3.w * x3 * dot(x3, g3) + m4.w * g3;
    vec4 px = vec4(dot(x0, g0), dot(x1, g1), dot(x2, g2), dot(x3, g3));
    return 42.0 * vec4(grad, dot(m4, px));
}

// The MIT License
// Copyright © 2013 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// https://www.youtube.com/c/InigoQuilez
// https://iquilezles.org/
//
// https://www.shadertoy.com/view/Xsl3Dl
vec3 hash3( vec3 p ) // replace this by something better
{
    p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
            dot(p,vec3(269.5,183.3,246.1)),
            dot(p,vec3(113.5,271.9,124.6)));

    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );

    vec3 u = f*f*(3.0-2.0*f);

    return mix( mix( mix( dot( hash3( i + vec3(0.0,0.0,0.0) ), f - vec3(0.0,0.0,0.0) ),
                          dot( hash3( i + vec3(1.0,0.0,0.0) ), f - vec3(1.0,0.0,0.0) ), u.x),
                     mix( dot( hash3( i + vec3(0.0,1.0,0.0) ), f - vec3(0.0,1.0,0.0) ),
                          dot( hash3( i + vec3(1.0,1.0,0.0) ), f - vec3(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hash3( i + vec3(0.0,0.0,1.0) ), f - vec3(0.0,0.0,1.0) ),
                          dot( hash3( i + vec3(1.0,0.0,1.0) ), f - vec3(1.0,0.0,1.0) ), u.x),
                     mix( dot( hash3( i + vec3(0.0,1.0,1.0) ), f - vec3(0.0,1.0,1.0) ),
                          dot( hash3( i + vec3(1.0,1.0,1.0) ), f - vec3(1.0,1.0,1.0) ), u.x), u.y), u.z );
}

float fbm(vec3 p, int octaves, float persistence, float lacunarity, float exponentiation) {
    float amplitude = 0.5;
    float frequency = 1.0;
    float total = 0.0;
    float normalization = 0.0;

    for (int i = 0; i < octaves; ++i) {
        float noiseValue = snoise(p * frequency).w;
        total += noiseValue * amplitude;
        normalization += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    total /= normalization;
    total = total * 0.5 + 0.5;
    total = pow(total, exponentiation);

    return total;
}

vec3 generate_grid_stars(vec2 pixel_coords, float star_radius, float cell_width, float seed, bool
twinkle) {
    vec2 cell_coords = (fract(pixel_coords / cell_width) - 0.5) * cell_width;
    vec2 cell_id = floor(pixel_coords / cell_width) + seed / 100.0;
    vec3 cell_hash_value = hash3(vec3(cell_id, 0.0));

    float star_brightness = saturate(cell_hash_value.z);
    vec2 star_position = vec2(0.0);
    star_position += cell_hash_value.xy * (cell_width * 0.5 - star_radius * 4.0);
    float dist_to_star = length(cell_coords - star_position);
    //float glow = smoothstep(star_radius + 1.0, star_radius, dist_to_star);
    float glow = exp(-2.0 * dist_to_star / star_radius);

    if (twinkle) {
        float noise_sample = noise(vec3(cell_id, u_time * 1.5));
        float twinkle_size = remap(noise_sample, -1.0, 1.0, 1.0, 0.1) * star_radius * 6.0;
        vec2 abs_dist = abs(cell_coords - star_position);
        float twinkle_value = smoothstep(star_radius * 0.25, 0.0, abs_dist.y) *
                              smoothstep(twinkle_size, 0.0, abs_dist.x);
        twinkle_value += smoothstep(star_radius * 0.25, 0.0, abs_dist.x) *
                              smoothstep(twinkle_size, 0.0, abs_dist.y);
        glow += twinkle_value;
    }

    return vec3(glow * star_brightness);
}

vec3 generate_stars(vec2 pixel_coords) {
    vec3 stars = vec3(0.0);

    float size = 4.0;
    float cell_width = 500.0;
    for (float i = 0.0; i < 2.0; ++i) {
        stars += generate_grid_stars(pixel_coords, size, cell_width, i, true);
        size *= 0.5;
        cell_width *= 0.35;
    }

    for (float i = 2.0; i < 5.0; ++i) {
        stars += generate_grid_stars(pixel_coords, size, cell_width, i, false);
        size *= 0.5;
        cell_width *= 0.35;
    }

    return stars;
}

float sdf_circle(vec2 p, float r) {
    return length(p) - r;
}

float map(vec3 pos) {
    return fbm(pos, 6, 0.5, 2.0, 4.0);
}

vec3 calc_normal(vec3 pos, vec3 n) {
  vec2 e = vec2(0.0001, 0.0);
  return normalize(
      n + -500.0 * vec3(
          map(pos + e.xyy) - map(pos - e.xyy),
          map(pos + e.yxy) - map(pos - e.yxy),
          map(pos + e.yyx) - map(pos - e.yyx)
      )
  );
}

mat3 rotate_y(float radians) {
  float s = sin(radians);
  float c = cos(radians);
  return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c);
}

vec3 draw_planet(vec2 pixel_coords, vec3 color) {
    float planet_size = 400.0;

    float d = sdf_circle(pixel_coords, planet_size);

    vec3 planet_color = vec3(1.0);
    if (d <= 0.0) {
        float x = pixel_coords.x / planet_size;
        float y = pixel_coords.y / planet_size;
        float z = sqrt(1.0 - x * x - y * y);

        mat3 planet_rotation = rotate_y(u_time * 0.1);
        vec3 view_normal = vec3(x, y, z);
        vec3 ws_position = planet_rotation * view_normal;
        vec3 ws_normal = planet_rotation * normalize(ws_position);
        vec3 ws_view_dir = planet_rotation * vec3(0.0, 0.0, 1.0);

        vec3 noise_coords = ws_position * 2.0;
        float noise_sample = fbm(noise_coords, 6, 0.5, 2.0, 4.0);
        float moisture_map = fbm(noise_coords * 0.5 + vec3(20.0), 2, 0.5, 2.0, 1.0);

        // Coloring
        vec3 water_color = mix(
            vec3(0.01, 0.09, 0.55), vec3(0.09, 0.26, 0.57), smoothstep(0.02, 0.06, noise_sample));
        vec3 land_color = mix(
            vec3(0.5, 1.0, 0.3), vec3(0.0, 0.7, 0.0), smoothstep(0.05, 0.1, noise_sample));
        land_color = mix(
            vec3(1.0, 1.0, 0.5), land_color, smoothstep(0.4, 0.5, moisture_map));
        land_color = mix(
            land_color, vec3(0.5), smoothstep(0.1, 0.2, noise_sample));
        land_color = mix(
            land_color, vec3(1.0), smoothstep(0.2, 0.3, noise_sample));
        land_color = mix(
            land_color, vec3(0.9), smoothstep(0.6, 0.9, abs(view_normal.y)));

        planet_color = mix(water_color, land_color, smoothstep(0.05, 0.06, noise_sample));

        // Lighting
        vec2 spec_params = mix(
            vec2(0.5, 32.0),
            vec2(0.01, 2.0),
            smoothstep(0.05, 0.06, noise_sample));
        vec3 ws_light_dir = planet_rotation * normalize(vec3(0.5, 1.0, 0.5));
        vec3 ws_surface_normal = calc_normal(noise_coords, ws_normal);

        float wrap = 0.05;
        float dp = max(0.0, (dot(ws_light_dir, ws_surface_normal) + wrap) / (1.0 + wrap));

        vec3 light_color = mix(vec3(0.25, 0.0, 0.0), vec3(0.75), smoothstep(0.05, 0.5, dp));
        vec3 ambient = vec3(0.002);
        vec3 diffuse = light_color * dp;

        vec3 r = normalize(reflect(-ws_light_dir, ws_surface_normal));
        float phong_value = max(0.0, dot(ws_view_dir, r));
        phong_value = pow(phong_value, spec_params.y);

        vec3 specular = vec3(phong_value) * spec_params.x * diffuse;

        vec3 planet_shading = planet_color * (diffuse + ambient) + specular;
        planet_color = planet_shading;

        // Fresnel
        float fresnel = smoothstep(1.0, 0.1, view_normal.z);
        fresnel = pow(fresnel, 8.0) * dp;
        planet_color = mix(planet_color, vec3(0.0, 0.5, 1.0), fresnel);
    }

    color = mix(color, planet_color, smoothstep(0.0, -1.0, d));

    if (d < 40.0 && d >= -1.0) {
        float x = pixel_coords.x / 440.0;
        float y = pixel_coords.y / 440.0;
        float z = sqrt(1.0 - x * x - y * y);
        vec3 normal = vec3(x, y, z);

        float lighting = dot(normal, normalize(vec3(0.5, 1.0, 0.5)));
        lighting = smoothstep(-0.15, 1.0, lighting);

        vec3 glow_color = vec3(0.05, 0.3, 0.9) *
            exp(-0.01 * d * d) * lighting * 0.75;
        color += glow_color;
    }

    return color;
}

void main() {
    vec2 pixel_coords = vec2(v_uvs - 0.5) * u_resolution;

    vec3 color = vec3(0.0);
    color = generate_stars(pixel_coords);
    color = draw_planet(pixel_coords, color);

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

class PlanetAndStarsScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()

  totalTime: number = 0.0
  clock = new THREE.Clock()

  gui = new GUI()
  uiState = {
    time: { value: 0.0 },
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    noise_type: 0,
    stepped: false,
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

    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
    this.uniforms.u_time.value = elapsedTime
    this.uniforms.u_noise_type.value = this.uiState.noise_type
    this.uniforms.u_stepped.value = this.uiState.stepped
    this.uniforms.u_octaves.value = this.uiState.octaves
    this.uniforms.u_persistence.value = this.uiState.persistence
    this.uniforms.u_lacunarity.value = this.uiState.lacunarity

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
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
    fbm_folder.add(this.uiState, 'octaves', 1, 8, 1)
    fbm_folder.add(this.uiState, 'persistence', 0.1, 1.0, 0.001)
    fbm_folder.add(this.uiState, 'lacunarity', 1.0, 10.0, 0.001)
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new PlanetAndStarsScene()
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
