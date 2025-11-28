<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { Scene } from '@/shared/scene/scene'

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
uniform float u_time;

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

vec3 background_color(float day_time) {
    vec3 morning = mix(
        vec3(0.44, 0.64, 0.84),
        vec3(0.34, 0.51, 0.94),
        smoothstep(0.0, 1.0, pow(v_uvs.x * v_uvs.y, 0.5))
    );
    vec3 midday = mix(
        vec3(0.42, 0.58, 0.75),
        vec3(0.36, 0.46, 0.82),
        smoothstep(0.0, 1.0, pow(v_uvs.x * v_uvs.y, 0.5))
    );
    vec3 evening = mix(
        vec3(0.82, 0.51, 0.25),
        vec3(0.88, 0.71, 0.39),
        smoothstep(0.0, 1.0, pow(v_uvs.x * v_uvs.y, 0.5))
    );
    vec3 night = mix(
        vec3(0.07, 0.1, 0.19),
        vec3(0.19, 0.2, 0.29),
        smoothstep(0.0, 1.0, pow(v_uvs.x * v_uvs.y, 0.5))
    );

    float day_length = 20.0;

    vec3 color;
    if (day_time < day_length * 0.25) {
      color = mix(morning, midday, smoothstep(0.0, day_length * 0.25, day_time));
    } else if (day_time < day_length * 0.5) {
      color = mix(midday, evening, smoothstep(day_length * 0.25, day_length * 0.5, day_time));
    } else if (day_time < day_length * 0.75) {
      color = mix(evening, night, smoothstep(day_length * 0.5, day_length * 0.75, day_time));
    } else {
      color = mix(night, morning, smoothstep(day_length * 0.75, day_length, day_time));
    }

    return color;
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

float sdf_moon(vec2 pixel_coords) {
    float d = op_subtraction(sdf_circle(pixel_coords + vec2(50.0, 0.0), 80.0),
    sdf_circle(pixel_coords, 80.0));
    return d;
}

float sdf_star(in vec2 p, in float r, in int n, in float m) {
    // next 4 lines can be precomputed for a given shape
    float an = 3.141593/float(n);
    float en = 3.141593/m;  // m is between 2 and n
    vec2  acs = vec2(cos(an),sin(an));
    vec2  ecs = vec2(cos(en),sin(en)); // ecs=vec2(0,1) for regular polygon

    float bn = mod(atan(p.x,p.y),2.0*an) - an;
    p = length(p)*vec2(cos(bn),abs(sin(bn)));
    p -= r*acs;
    p += ecs*clamp( -dot(p,ecs), 0.0, r*acs.y/ecs.y);
    return length(p)*sign(p.x);
}

float hash(vec2 v) {
    float t = dot(v, vec2(36.5323, 73.945));
    return sin(t);
}

float saturate(float t) {
    return clamp(t, 0.0, 1.0);
}

float ease_out(float x, float p) {
    return 1.0 - pow(1.0 - x, p);
}

float ease_out_bounce(float x) {
    const float n1 = 7.5625;
    const float d1 = 2.75;

    if (x < 1.0 / d1) {
        return n1 * x * x;
    } else if (x < 2.0 / d1) {
        x -= 1.5 / d1;
        return n1 * x * x + 0.75;
    } else if (x < 2.5 / d1) {
        x -= 2.25 / d1;
        return n1 * x * x + 0.9375;
    } else {
        x -= 2.625 / d1;
        return n1 * x * x + 0.984375;
    }
}

void main(){
    vec2 pixel_coords = v_uvs * u_resolution;

    float day_length = 20.0;
    float day_time = mod(u_time + 8.0, day_length);

    vec3 color = background_color(day_time);

    // SUN
    if (day_time < day_length * 0.75) {
        float t = saturate(inverse_lerp(day_time, 0.0, 1.0));
        vec2 offset = vec2(400.0, u_resolution.y * 0.8) + mix(vec2(0.0, 400.0), vec2(0.0), ease_out(t,
        5.0));

        if (day_time > day_length * 0.5) {
            t = saturate(inverse_lerp(day_time, day_length * 0.5, day_length * 0.5 + 1.0));
            offset = vec2(400.0, u_resolution.y * 0.8) + mix(vec2(0.0), vec2(0.0, 400.0), t);
        }

        vec2 sun_pos = pixel_coords - offset;

        float sun = sdf_circle(sun_pos, 100.0);
        color = mix(vec3(0.84, 0.62, 0.26), color, smoothstep(0.0, 2.0, sun));

        float s = max(0.001, sun);
        float p = saturate(exp(-0.001 * s * s));
        color += 0.5 * mix(vec3(0.0), vec3(0.9, 0.85, 0.47), p);
    }

    // MOON
    if (day_time > day_length * 0.5) {
        float t = saturate(inverse_lerp(day_time, day_length * 0.5, day_length * 0.5 + 1.5));
        vec2 offset = u_resolution * 0.8 + mix(vec2(0.0, 400.0), vec2(0.0), ease_out_bounce(t));

        if (day_time > day_length * 0.9) {
            t = saturate(inverse_lerp(day_time, day_length * 0.9, day_length * 0.95));
            offset = u_resolution * 0.8 + mix(vec2(0.0), vec2(0.0, 400.0), t);
        }

        vec2 moon_shadow_pos = pixel_coords - offset + vec2(15.0);
        moon_shadow_pos = rotate_2D(3.14159 * -0.2) * moon_shadow_pos;

        float moon_shadow = sdf_moon(moon_shadow_pos);
        color = mix(vec3(0.0), color, smoothstep(-40.0, 10.0, moon_shadow));

        vec2 moon_pos = pixel_coords - offset;
        moon_pos = rotate_2D(3.14159 * -0.2) * moon_pos;

        float moon = sdf_moon(moon_pos);
        color = mix(vec3(1.0), color, smoothstep(0.0, 2.0, moon));

        float moon_glow = sdf_moon(moon_pos);
        color += 0.1 * mix(vec3(1.0), vec3(0.0), smoothstep(-10.0, 15.0, moon_glow));
    }

    // STARS
    const float NUM_STARS = 15.0;
    for (float i = 0.0; i < NUM_STARS; i += 1.0) {
        float hash_sample = hash(vec2(i * 13.0)) * 0.5 + 0.5;

        float t = saturate(inverse_lerp(
            day_time + hash_sample * 0.5,
            day_length * 0.5,
            day_length * 0.5 + 1.5
        ));

        float fade = 0.0;
        if (day_time > day_length * 0.9) {
            fade = saturate(inverse_lerp(
                day_time - hash_sample * 0.25,
                day_length * 0.9,
                day_length * 0.95
            ));
        }

        float size = mix(2.0, 1.0, hash(vec2(i, i + 1.0)));
        vec2 offset = vec2(i * 100.0, 0.0) + 150.0 * hash(vec2(i));
        offset += mix(vec2(0.0, 600.0), vec2(0.0), ease_out_bounce(t));

        float rot = mix(-3.14159, 2.14159, hash_sample);

        vec2 pos = pixel_coords - offset;
        pos.x = mod(pos.x, u_resolution.x);
        pos = pos - u_resolution * vec2(0.5, 0.75);
        pos = rotate_2D(rot) * pos;
        pos *= size;

        float star = sdf_star(pos, 20.0, 5, 3.0);
        vec3 star_color = mix(vec3(1.0), color, smoothstep(0.0, 2.0, star));
        star_color += mix(0.2, 0.0, pow(smoothstep(-5.0, 15.0, star), 0.25));

        color = mix(star_color, color, fade);
    }

    // CLOUDS
    const float NUM_CLOUDS = 8.0;
    for (float i = 0.0; i < NUM_CLOUDS; i += 1.0) {
        float size = mix(2.0, 1.0, (i / NUM_CLOUDS) + 0.1 * hash(vec2(i)));
        float speed = size * 0.25;

        vec2 offset = vec2(i * 200.0 + u_time * 100.0 * speed, 200.0 * hash(vec2(i)));
        vec2 pos = pixel_coords - offset;

        pos = mod(pos, u_resolution);
        pos = pos - u_resolution * 0.5;

        float cloud_shadow = sdf_cloud(pos * size + vec2(25.0)) - 40.0;
        float cloud = sdf_cloud(pos * size);
        color = mix(color, vec3(0.0), 0.5 * smoothstep(0.0, -100.0, cloud_shadow));
        color = mix(vec3(1.0), color, smoothstep(0.0, 1.0, cloud));
    }

    gl_FragColor = vec4(color, 1.0);
}
`

class CloudyDayScene extends Scene {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock()

  uiState = {
    u_time: { value: 0.0 },
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
      u_time: { value: this.uiState.u_time },
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
