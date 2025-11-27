<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type Scene } from '@/types/scene'
import { TextureAtlas } from '@/shared/textures/texture-atlas'
import { GUI } from 'lil-gui'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: SingleBladeGrassScene

const NUM_GRASS = 16 * 1024
const GRASS_SEGMENTS = 6
const GRASS_VERTICES = (GRASS_SEGMENTS + 1) * 2
const GRASS_PATCH_SIZE = 25
const GRASS_WIDTH = 0.25
const GRASS_HEIGHT = 2

const grassVertexShader = `
uniform vec4 u_grass_params;
uniform float u_time;
uniform sampler2D u_tile_data_texture;

varying vec3 v_color;
varying vec4 v_grass_data;
varying vec3 v_normal;
varying vec3 v_world_position;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

uvec2 murmurHash21(uint src) {
    const uint M = 0x5bd1e995u;
    uvec2 h = uvec2(1190494759u, 2147483647u);
    src *= M;
    src ^= src>>24u;
    src *= M;
    h *= M;
    h ^= src;
    h ^= h>>13u;
    h *= M;
    h ^= h>>15u;
    return h;
}

// 2 outputs, 1 input
vec2 hash21(float src) {
  uvec2 h = murmurHash21(floatBitsToUint(src));
  return uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
}

vec2 quick_hash(float p) {
    vec2 r = vec2(
        dot(vec2(p), vec2(17.43267, 23.8934543)),
        dot(vec2(p), vec2(13.98342, 37.2435232)));

    return fract(sin(r) * 1743.54892229);
}

vec3 hash(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));

    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float ease_out(float x, float t) {
    return 1.0 - pow(1.0 - x, t);
}

// Cubic Bezier curve evaluation (3D)
// p0: start point, p1: first control point, p2: second control point, p3: end point
// t: parameter from 0.0 to 1.0
vec3 bezier(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    float u = 1.0 - t;
    float tt = t * t;
    float uu = u * u;
    float uuu = uu * u;
    float ttt = tt * t;

    vec3 point = uuu * p0;           // (1-t)^3 * p0
    point += 3.0 * uu * t * p1;      // 3(1-t)^2 * t * p1
    point += 3.0 * u * tt * p2;      // 3(1-t) * t^2 * p2
    point += ttt * p3;               // t^3 * p3

    return point;
}

// Cubic Bezier gradient - interpolates colors along a cubic Bezier curve
// c0: start color, c1: first control color, c2: second control color, c3: end color
// t: parameter from 0.0 to 1.0
vec3 bezier_grad(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t) {
    float u = 1.0 - t;
    float tt = t * t;
    float uu = u * u;
    float uuu = uu * u;
    float ttt = tt * t;

    vec3 color = uuu * c0;           // (1-t)^3 * c0
    color += 3.0 * uu * t * c1;      // 3(1-t)^2 * t * c1
    color += 3.0 * u * tt * c2;      // 3(1-t) * t^2 * c2
    color += ttt * c3;               // t^3 * c3

    return color;
}

mat3 rotate_y(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

mat3 rotate_axis(vec3 axis, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;

  return mat3(
    oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
  );
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

vec3 terrain_height(vec3 world_pos) {
    return vec3(world_pos.x, noise(world_pos * 0.02)  * 10.0, world_pos.z);
}

const vec3 BASE_COLOR = vec3(0.1, 0.4, 0.04);
const vec3 TIP_COLOR = vec3(0.5, 0.7, 0.3);

void main() {
    int GRASS_SEGMENTS = int(u_grass_params.x);
    int GRASS_VERTICES = (GRASS_SEGMENTS + 1) * 2;
    float GRASS_PATCH_SIZE = u_grass_params.y;
    float GRASS_WIDTH = u_grass_params.z;
    float GRASS_HEIGHT = u_grass_params.w;

    // Figure out grass offset
    vec2 hashed_instance_ID = hash21(float(gl_InstanceID)) * 2.0 - 1.0;
    vec3 grass_offset = vec3(hashed_instance_ID.x, 0.0, hashed_instance_ID.y) * GRASS_PATCH_SIZE;

    // Add the same height as the terrain
    grass_offset = terrain_height(grass_offset);

    vec3 grass_blade_world_pos = (modelMatrix * vec4(grass_offset, 1.0)).xyz;
    vec3 hash_val = hash(grass_blade_world_pos);

    // Grass type
    float grass_type = saturate(hash_val.z) > 0.95 ? 1.0 : 0.0;

    // Grass rotation
    const float PI = 3.14159;
    float angle = remap(hash_val.x, -1.0, 1.0, -PI, PI);

    vec4 tile_data = texture2D(
      u_tile_data_texture,
      vec2(-grass_blade_world_pos.x, grass_blade_world_pos.z) / GRASS_PATCH_SIZE * 0.5 + 0.5);

    // Stiffness
    float stiffness = 1.0 - tile_data.x * 0.85;
    float tile_grass_height = (1.0 - tile_data.x) * mix(1.0, 1.5, grass_type);

    // Debug
    //grass_offset = vec3(float(gl_InstanceID) * 0.5 - 8.0, 0.0, 0.0);
    //angle = float(gl_InstanceID) * 0.2;

    // Figure out vertex id, > GRASS_VERTICES is other side
    int vertFB_ID = gl_VertexID % (GRASS_VERTICES * 2);
    int vertID = vertFB_ID % GRASS_VERTICES;

    // 0 = left, 1 = right
    int x_test = vertID & 0x1;
    int z_test = (vertFB_ID >= GRASS_VERTICES) ? 1 : -1;
    float x_side = float(x_test);
    float z_side = float(z_test);
    float height_percent = float(vertID - x_test) / (float(GRASS_SEGMENTS) * 2.0);

    float width = GRASS_WIDTH; //* ease_out(1.0 - height_percent, 4.0) * tile_grass_height;
    float height = GRASS_HEIGHT * tile_grass_height;

    // Calculate the vertex position
    float x = (x_side - 0.5) * width;
    float y = height_percent * height;
    float z = 0.0;

    // Grass lean factor
    float wind_strength = noise(vec3(grass_blade_world_pos.xz * 0.05, 0.0) + u_time);
    float wind_angle = 0.0;
    vec3 wind_axis = vec3(cos(wind_angle), 0.0, sin(wind_angle));
    float wind_lean_angle = wind_strength * 1.5 * height_percent * stiffness;

    //float rand_lean_animation = sin(u_time * 2.0 + hash_val.y) * 0.025;
    float rand_lean_animation = noise(vec3(grass_blade_world_pos.xz, u_time * 4.0)) * wind_strength;
    float lean_factor = remap(hash_val.y, -1.0, 1.0, -0.5, 0.5) + rand_lean_animation;

    // Debug
    //lean_factor = 1.0;

    // Add the bezier curve for bend
    vec3 p1 = vec3(0.0);
    vec3 p2 = vec3(0.0, 0.33, 0.0);
    vec3 p3 = vec3(0.0, 0.66, 0.0);
    vec3 p4 = vec3(0.0, cos(lean_factor), sin(lean_factor));
    vec3 curve = bezier(p1, p2, p3, p4, height_percent);

    // Calculate the normal
    vec3 curve_grad = bezier_grad(p1, p2, p3, p4, height_percent);
    mat2 curve_rot_90 = mat2(0.0, 1.0, -1.0, 0.0) * -z_side;

    y = curve.y * height;
    z = curve.z * height;

    // Generate grass matrix
    mat3 grass_mat = rotate_axis(wind_axis, wind_lean_angle) * rotate_y(angle);

    vec3 grass_local_position = grass_mat * vec3(x, y, z) + grass_offset;
    vec3 grass_local_normal = grass_mat * vec3(0.0, curve_rot_90 * curve_grad.yz);

    // Blend normal
    float distance_blend = smoothstep(0.0, 10.0, distance(cameraPosition, grass_blade_world_pos));
    grass_local_normal = mix(grass_local_normal, vec3(0.0, 1.0, 0.0), distance_blend);
    grass_local_normal = normalize(grass_local_normal);

    // Viewspace thicken
    vec4 mv_position = modelViewMatrix * vec4(grass_local_position, 1.0);

    vec3 view_dir = normalize(cameraPosition - grass_blade_world_pos);
    vec3 grass_face_normal = (grass_mat * vec3(0.0, 0.0, -z_side));

    float view_dot_normal = saturate(dot(grass_face_normal, view_dir));
    float view_space_thicken_factor = ease_out(1.0 - view_dot_normal, 4.0) *
        smoothstep(0.0, 0.2, view_dot_normal);

    mv_position.x += view_space_thicken_factor * (x_side - 0.5) * width * 0.5 * -z_side;

    gl_Position = projectionMatrix * mv_position;
    gl_Position.w = tile_grass_height < 0.25 ? 0.0 : gl_Position.w; // Discards tiny grass blades
    //gl_Position = projectionMatrix * modelViewMatrix * vec4(grass_local_position, 1.0);

    // Debug
    //v_color = grass_local_normal;

    //vec3 c1 = mix(BASE_COLOR, TIP_COLOR, height_percent);
    //vec3 c2 = mix(vec3(0.6, 0.6, 0.4), vec3(0.88, 0.87, 0.52), height_percent);
    //float noise_val = noise(grass_blade_world_pos * 0.1);
    //v_color = mix(c1, c2, smoothstep(-1.0, 1.0, noise_val));
    v_color = mix(BASE_COLOR, TIP_COLOR, height_percent);
    //v_color = mix(vec3(1.0, 0.0, 0.0), v_color, stiffness);
    //v_color = vec3(view_space_thicken_factor);

    v_normal = normalize((modelMatrix * vec4(grass_local_normal, 0.0)).xyz);
    v_world_position = (modelMatrix * vec4(grass_local_position, 1.0)).xyz;
    v_grass_data = vec4(x, height_percent, x_side, grass_type);
}
`

const grassFragmentShader = `
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2DArray u_grass_diffuse;

varying vec3 v_color;
varying vec4 v_grass_data;
varying vec3 v_normal;
varying vec3 v_world_position;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

vec3 hemi_light(vec3 normal, vec3 ground_color, vec3 sky_color) {
    return mix(ground_color, sky_color, 0.5 * normal.y + 0.5);
}

vec3 lambert_light(vec3 normal, vec3 view_dir, vec3 light_dir, vec3 light_color) {
    float wrap = 0.5;
    float dot_nl = saturate((dot(normal, light_dir) + wrap) / (1.0 + wrap));
    vec3 lighting = vec3(dot_nl);

    float backlight = saturate((dot(view_dir, -light_dir) + wrap) / (1.0 + wrap));
    vec3 scatter = vec3(pow(backlight, 2.0));

    lighting += scatter;

    return lighting * light_color;
}

vec3 phong_specular(vec3 normal, vec3 light_dir, vec3 view_dir) {
    float dot_nl = saturate(dot(normal, light_dir));

    vec3 r = normalize(reflect(-light_dir, normal));
    float phong_value = max(0.0, dot(view_dir, r));
    phong_value = pow(phong_value, 32.0);

    vec3 specular = dot_nl * vec3(phong_value);

    return specular;
}

void main() {
    float grass_x = v_grass_data.x;
    float grass_y = v_grass_data.y;
    float grass_type = v_grass_data.w;

    vec3 normal = normalize(v_normal);
    vec3 view_dir = normalize(cameraPosition - v_world_position);

    vec2 uv = v_grass_data.zy;
    //vec3 base_color = mix(v_color * 0.75, v_color, smoothstep(0.125, 0.0, abs(grass_x)));
    vec4 base_color = texture2D(u_grass_diffuse, vec3(uv, grass_type));

    if (base_color.w < 0.5) discard;

    // Hemi
    vec3 c1 = vec3(1.0, 1.0, 0.75);
    vec3 c2 = vec3(0.05, 0.05, 0.25);

    vec3 ambient_lighting = hemi_light(normal, c2, c1);

    // Directional light
    vec3 light_dir = normalize(vec3(-1.0, 0.5, 1.0));
    vec3 light_color = vec3(1.0);
    vec3 diffuse_lighting = lambert_light(normal, view_dir, light_dir, light_color);

    // Specular
    vec3 specular = phong_specular(normal, light_dir, view_dir);

    // Fake AO
    float ao = remap(pow(grass_y, 2.0), 0.0, 1.0, 0.125, 1.0);

    vec3 lighting = diffuse_lighting * 0.5 + ambient_lighting * 0.5 + specular * 0.25;

    vec3 color = base_color.xyz * lighting;
    color *= ao;
    //color = v_color;

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

const skyVertexShader = `
void main() {
    vec4 local_space_position = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * local_space_position;
}
`

const skyFragmentShader = `
uniform vec2 u_resolution;
uniform float u_time;

vec3 LIGHT_BLUE = vec3(0.42, 0.65, 0.85);
vec3 BRIGHT_BLUE = vec3(0.01, 0.2, 1.0);
vec3 LIGHT_RED = vec3(0.85, 0.28, 0.28);
vec3 DARK_YELLOW = vec3(0.25, 0.25, 0.0625);

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    float blue_t = pow(smoothstep(0.0, 1.0, uv.y) * smoothstep(1.0, 0.0, uv.x), 0.5);
    float yellow_t = 1.0 - pow(smoothstep(0.0, 1.0, uv.y) * smoothstep(1.0, 0.0, uv.x), 0.1);
    float black_t = 1.0 - pow(smoothstep(0.0, 0.5, uv.x) * smoothstep(1.0, 0.5, uv.y), 0.2);
    black_t *= smoothstep(0.0, 1.0, uv.y) * smoothstep(1.0, 0.0, uv.x);

    vec3 color = mix(LIGHT_BLUE, BRIGHT_BLUE, blue_t);
    color = mix(color, DARK_YELLOW, yellow_t * 0.75);
    color = mix(color, vec3(0.0), black_t * 0.75);

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

const groundVertexShader = `
varying vec3 v_world_position;
varying vec3 v_world_normal;
varying vec2 v_uv;

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

vec3 terrain_height(vec3 world_pos) {
    return vec3(world_pos.x, noise(world_pos * 0.02)  * 10.0, world_pos.z);
}

void main() {
    vec4 local_space_position = vec4(position, 1.0);
    vec4 world_position = modelMatrix * local_space_position;

    world_position.xyz = terrain_height(world_position.xyz);

    v_world_position = world_position.xyz;
    v_world_normal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    v_uv = uv;

    gl_Position = projectionMatrix * viewMatrix * world_position;
}
`

const groundFragmentShader = `
varying vec3 v_world_position;
varying vec3 v_world_normal;
varying vec2 v_uv;

uniform sampler2D u_diffuse_texture;

float inverseLerp(float v, float minValue, float maxValue) {
  return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
  float t = inverseLerp(v, inMin, inMax);
  return mix(outMin, outMax, t);
}

float hash(vec2 p)  // replace this by something better
{
    p  = 50.0*fract( p*0.3183099 + vec2(0.71,0.113));
    return -1.0+2.0*fract( p.x*p.y*(p.x+p.y) );
}

void main() {
    // Grid
    float grid1 = texture(u_diffuse_texture, v_world_position.xz * 0.1).r;
    float grid2 = texture(u_diffuse_texture, v_world_position.xz * 1.0).r;

    float grid_hash1 = hash(floor(v_world_position.xz * 1.0));

    vec3 grid_color = mix(
        vec3(0.5 + remap(grid_hash1, -1.0, 1.0, -0.2, 0.2)),
        vec3(0.0625),
        grid2);
    grid_color = mix(grid_color, vec3(0.00625), grid1);

    vec3 color = grid_color;

    // Debug
    //float d1 = length(v_world_position - vec3(0.0, 0.0, 5.0)) - 1.0;
    //float d2 = length(v_world_position - vec3(5.0, 0.0, 0.0)) - 1.0;
    //color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0), smoothstep(0.0, 0.1, d1));
    //color = mix(vec3(1.0, 0.0, 0.0), color, smoothstep(0.0, 0.1, d2));

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`

class SingleBladeGrassScene implements Scene {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera()
  uniforms: { [uniform: string]: THREE.IUniform<any> } = {}

  playgroundEl = elementRef.value
  renderer = new THREE.WebGLRenderer()
  materials: THREE.Material[] = []

  totalTime: number = 0.0
  clock = new THREE.Clock()

  gui = new GUI()
  uiState = {
    time: { value: 0.0 },
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

    const fov = 60
    const aspect = 1920 / 1080
    const near = 0.1
    const far = 10000.0
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
    this.camera.position.set(10, 5, 5)

    const light = new THREE.DirectionalLight(0xffffff, 1.0)
    light.position.set(1, 1, 1)
    light.lookAt(0, 0, 0)
    this.scene.add(light)

    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.update()

    this.materials = []

    await this.setupProject()

    this.onWindowResize()
    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.uniforms = {
      u_resolution: { value: [window.innerWidth, window.innerHeight] },
      u_time: { value: this.uiState.time },
    }

    // Sky
    const skyGeometry = new THREE.SphereGeometry(5000, 32, 15)
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
    })

    const sky = new THREE.Mesh(skyGeometry, skyMaterial)
    sky.castShadow = false
    sky.receiveShadow = false
    this.scene.add(sky)
    this.materials.push(skyMaterial)

    // Ground
    const diffuseTexture = new THREE.TextureLoader().load('/textures/grid.png')
    diffuseTexture.wrapS = THREE.RepeatWrapping
    diffuseTexture.wrapT = THREE.RepeatWrapping

    const groundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        u_time: { value: 0 },
        u_diffuse_texture: { value: diffuseTexture },
      },
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
    })

    const groundGeometry = new THREE.PlaneGeometry(1, 1, 512, 512)
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial)

    groundPlane.rotateX(-Math.PI / 2)
    groundPlane.scale.setScalar(500)

    this.scene.add(groundPlane)
    this.materials.push(groundMaterial)

    // Grass
    const tileDataTexture = new THREE.TextureLoader().load('/textures/tileData.jpg')
    const grassUniforms = {
      ...this.uniforms,
      u_grass_params: {
        value: new THREE.Vector4(GRASS_SEGMENTS, GRASS_PATCH_SIZE, GRASS_WIDTH, GRASS_HEIGHT),
      },
      u_tile_data_texture: {
        value: tileDataTexture,
      },
      u_grass_diffuse: {
        value: null,
      },
    }

    const diffuse = new TextureAtlas()
    diffuse.Load('diffuse', ['/textures/grass1.png', '/textures/grass2.png'])
    diffuse.onLoad = () => {
      grassUniforms.u_grass_diffuse.value = diffuse.Info['diffuse'].atlas
    }

    const grassMaterial = new THREE.ShaderMaterial({
      uniforms: grassUniforms,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.FrontSide,
    })
    const grassGeometry = this.createGeometry(GRASS_SEGMENTS)
    const grassMesh = new THREE.Mesh(grassGeometry, grassMaterial)
    grassMesh.position.set(0, 0, 0)
    this.scene.add(grassMesh)

    this.materials.push(grassMaterial)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    const elapsedTime = this.clock.getElapsedTime()

    this.uniforms.u_time.value = elapsedTime

    this.renderer.render(this.scene, this.camera)
  }

  private onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    this.uniforms.u_resolution.value = [window.innerWidth, window.innerHeight]
  }

  private initDebugUI() {}

  private createGeometry(segments: number): THREE.InstancedBufferGeometry {
    const vertices = (segments + 1) * 2
    const indices = []

    for (let i = 0; i < segments; ++i) {
      const vi = i * 2
      indices[i * 12 + 0] = vi + 0
      indices[i * 12 + 1] = vi + 1
      indices[i * 12 + 2] = vi + 2

      indices[i * 12 + 3] = vi + 2
      indices[i * 12 + 4] = vi + 1
      indices[i * 12 + 5] = vi + 3

      const fi = vertices + vi
      indices[i * 12 + 6] = fi + 2
      indices[i * 12 + 7] = fi + 1
      indices[i * 12 + 8] = fi + 0

      indices[i * 12 + 9] = fi + 3
      indices[i * 12 + 10] = fi + 1
      indices[i * 12 + 11] = fi + 2
    }

    const geo = new THREE.InstancedBufferGeometry()
    geo.instanceCount = NUM_GRASS
    geo.setIndex(indices)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1 + GRASS_PATCH_SIZE * 2)

    return geo
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new SingleBladeGrassScene()
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
