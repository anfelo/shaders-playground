<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Scene } from '@/shared/scene/scene'
import { useStats } from '@/composables/stats'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import type { Font } from 'three/addons/loaders/FontLoader.js'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: GPUParticlesStatefulScene

const stats = useStats()

const statefulInitVertexShader = `
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 v_uvs;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    v_uvs = uv;
}
`

const statefulInitFragmentShader = `
precision highp float;
precision highp sampler2D;

in vec2 v_uvs;

uniform sampler2D u_data_texture;

out vec4 out_Color;

void main(){
    vec4 packedCoordinate = texture(u_data_texture, v_uvs);
    out_Color = packedCoordinate;
}
`

const statefulUpdateVertexShader = `
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 v_uvs;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    v_uvs = uv;
}
`

const statefulUpdateFragmentShader = `
precision highp float;
precision highp sampler2D;

in vec2 v_uvs;

uniform float u_time_elapsed;
uniform float u_time;
uniform sampler2D u_current_buffer;
uniform sampler2D u_previous_buffer;
uniform sampler2D u_data_texture;

out vec4 out_Color;

float inverseLerp(float a, float b, float v) {
  return (v - a) / (b - a);
}

float remap(float v, float a, float b, float c, float d) {
  return mix(c, d, inverseLerp(a, b, v));
}

float gain( float x, float k ) {
  float a = 0.5*pow(2.0*((x<0.5)?x:1.0-x), k);
  return (x<0.5)?a:1.0-a;
}

float easeIn(float t, float k) {
  return pow(t, k);
}

//------------------------------------------------------------------------------

uint murmurHash12(uvec2 src) {
    const uint M = 0x5bd1e995u;
    uint h = 1190494759u;
    src *= M; src ^= src>>24u; src *= M;
    h *= M; h ^= src.x; h *= M; h ^= src.y;
    h ^= h>>13u; h *= M; h ^= h>>15u;
    return h;
}

// 1 output, 2 inputs
float hash12(vec2 src) {
  uint h = murmurHash12(floatBitsToUint(src));
  float v = uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
  return v * 2.0 - 1.0;
}

uvec3 murmurHash34(uvec4 src) {
  const uint M = 0x5bd1e995u;
  uvec3 h = uvec3(1190494759u, 2147483647u, 3559788179u);
  src *= M; src ^= src>>24u; src *= M;
  h *= M; h ^= src.x; h *= M; h ^= src.y; h *= M; h ^= src.z; h *= M; h ^= src.w;
  h ^= h>>13u; h *= M; h ^= h>>15u;
  return h;
}

// 3 outputs, 4 inputs
vec3 hash34(vec4 src) {
  uvec3 h = murmurHash34(floatBitsToUint(src));
  vec3 v = uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
  return v * 2.0 - 1.0;
}

uint murmurHash13(uvec3 src) {
    const uint M = 0x5bd1e995u;
    uint h = 1190494759u;
    src *= M; src ^= src>>24u; src *= M;
    h *= M; h ^= src.x; h *= M; h ^= src.y; h *= M; h ^= src.z;
    h ^= h>>13u; h *= M; h ^= h>>15u;
    return h;
}

// 1 output, 3 inputs
float hash13(vec3 src) {
  uint h = murmurHash13(floatBitsToUint(src));
  float v = uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
  return v * 2.0 - 1.0;
}

float noise13(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);

  return mix(mix(mix( hash13(i+vec3(0.0, 0.0, 0.0)),
                      hash13(i+vec3(1.0, 0.0, 0.0)),f.x),
                 mix( hash13(i+vec3(0.0, 1.0, 0.0)),
                      hash13(i+vec3(1.0, 1.0, 0.0)),f.x),f.y),
             mix(mix( hash13(i+vec3(0.0, 0.0, 1.0)),
                      hash13(i+vec3(1.0, 0.0, 1.0)),f.x),
                 mix( hash13(i+vec3(0.0, 1.0, 1.0)),
                      hash13(i+vec3(1.0, 1.0, 1.0)),f.x),f.y),f.z);
}

vec3 noise34(vec4 x) {
  vec4 i = floor(x);
  vec4 f = fract(x);
  // f = f*f*(3.0-2.0*f);

  vec3 v1 = mix(mix(mix( hash34(i+vec4(0.0, 0.0, 0.0, 0.0)),
                         hash34(i+vec4(1.0, 0.0, 0.0, 0.0)),f.x),
                    mix( hash34(i+vec4(0.0, 1.0, 0.0, 0.0)),
                         hash34(i+vec4(1.0, 1.0, 0.0, 0.0)),f.x),f.y),
                mix(mix( hash34(i+vec4(0.0, 0.0, 1.0, 0.0)),
                         hash34(i+vec4(1.0, 0.0, 1.0, 0.0)),f.x),
                    mix( hash34(i+vec4(0.0, 1.0, 1.0, 0.0)),
                         hash34(i+vec4(1.0, 1.0, 1.0, 0.0)),f.x),f.y),f.z);

  vec3 v2 = mix(mix(mix( hash34(i+vec4(0.0, 0.0, 0.0, 1.0)),
                         hash34(i+vec4(1.0, 0.0, 0.0, 1.0)),f.x),
                    mix( hash34(i+vec4(0.0, 1.0, 0.0, 1.0)),
                         hash34(i+vec4(1.0, 1.0, 0.0, 1.0)),f.x),f.y),
                mix(mix( hash34(i+vec4(0.0, 0.0, 1.0, 1.0)),
                         hash34(i+vec4(1.0, 0.0, 1.0, 1.0)),f.x),
                    mix( hash34(i+vec4(0.0, 1.0, 1.0, 1.0)),
                         hash34(i+vec4(1.0, 1.0, 1.0, 1.0)),f.x),f.y),f.z);

  return mix(v1, v2, f.w);
}

vec3 curlNoise(vec4 p) {
  const float e = 0.1;
  vec4 dx = vec4(e, 0.0, 0.0, 0.0);
  vec4 dy = vec4(0.0, e, 0.0, 0.0);
  vec4 dz = vec4(0.0, 0.0, e, 0.0);

  vec3 dx0 = noise34(p - dx);
  vec3 dx1 = noise34(p + dx);
  vec3 dy0 = noise34(p - dy);
  vec3 dy1 = noise34(p + dy);
  vec3 dz0 = noise34(p - dz);
  vec3 dz1 = noise34(p + dz);

  float x = dy1.z - dy0.z - dz1.y + dz0.y;
  float y = dz1.x - dz0.x - dx1.z + dx0.z;
  float z = dx1.y - dx0.y - dy1.x + dy0.x;

  return normalize(vec3(x, y, z) / (2.0 * e));
}

struct AttractorParams {
  vec3 position;
  float radius;
  float intensity;
  float decay;
};

vec3 CalculateAttractorForce(vec3 currentPosition, AttractorParams attractorParams) {
  float distToAttractor = distance(currentPosition, attractorParams.position);
  float attractorRadius = attractorParams.radius;
  float distOverRadius = distToAttractor / attractorRadius;

  // Soft attractor
  float decay = attractorParams.decay;
  float attractorIntensity = attractorParams.intensity;
  float attractorForce = attractorIntensity * (
      1.0 - exp(-distOverRadius * decay));

  vec3 dirToAttractor = attractorParams.position - currentPosition;

  return dirToAttractor * attractorForce;
}

void main() {
  vec3 currentPosition = texture(u_current_buffer, v_uvs).xyz;
  vec3 previousPosition = texture(u_previous_buffer, v_uvs).xyz;
  vec3 deltaPosition = currentPosition - previousPosition;

  // Verlet integration
  vec3 forces = vec3(0.0);
  float drag = 0.25;

  // Apply forces

  // Apply an attractor force
  float t = noise13(vec3(v_uvs, u_time)) * 0.5 + 0.5;
  float attractionRandomness = remap(noise13(vec3(v_uvs, u_time * 0.5)), -1.0, 1.0, 0.0, 1.0);
  attractionRandomness = gain(attractionRandomness, 8.0);
  float attractorIntensity = mix(10.0, 1000.0, pow(t, 2.0)) * (noise13(vec3(v_uvs, u_time * 0.5)) * 0.5 + 0.5);

  attractorIntensity = 100.0;

  AttractorParams attractorParams = AttractorParams(
      texture(u_data_texture, v_uvs).xyz, 0.1, attractorIntensity, 1.0);
  float distToAttractor = distance(currentPosition, attractorParams.position);

  // Create repulsor force
  vec3 repulsor = vec3(sin(u_time * 0.25) * 10.0, 0.0, 0.0);
  float repulsorHash = remap(hash12(v_uvs), -1.0, 1.0, 0.0, 1.0);
  float repulsorIntensityRandomness = remap(easeIn(repulsorHash, 4.0), 0.0, 1.0, 0.25, 1.0);
  {
    float repulsorRadius = 1.0;
    float distToRepulsor = distance(currentPosition, repulsor);
    float distOverRadius = distToRepulsor / repulsorRadius;

    // Soft repulsor
    float decay = 1.0;
    float repulsorIntensity = 2000.0 * repulsorIntensityRandomness;
    float repulsorForce = repulsorIntensity * (
        exp(-distOverRadius * decay));
    vec3 dirToRepulsor = -normalize(repulsor - currentPosition);
    forces += dirToRepulsor * repulsorForce;

    attractorParams.intensity *= max(1.0, distToRepulsor) * 0.1;
  }

  forces += CalculateAttractorForce(currentPosition, attractorParams);


  float noiseIntensity = 10.0;
  forces += curlNoise(vec4(currentPosition, u_time * 0.5)) * noiseIntensity;

  // forces = vec3(0.0);

  vec3 newPosition = currentPosition + deltaPosition * drag + (
      forces * u_time_elapsed * u_time_elapsed);

  out_Color = vec4(newPosition, distToAttractor);
}
`

const statefulDrawVertexShader = `
precision highp float;
precision highp sampler2DArray;

in float position;

out vec4 vColor;

uniform sampler2D u_data_texture;
uniform float u_time;
uniform vec2 u_resolution;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

float inverseLerp(float a, float b, float v) {
  return (v - a) / (b - a);
}

float easeIn(float t, float k) {
  return pow(t, k);
}

vec2 unpackUV(float position, vec2 resolution) {
  int index = int(position);
  ivec2 pixelIndex = ivec2(index % int(resolution.x), index / int(resolution.x));

  return vec2(pixelIndex) / resolution + 0.5 / resolution;
}

void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec2 uv = unpackUV(position, u_resolution);

    vec4 packedCoordinate = texture(u_data_texture, uv);
    vec3 localPosition = packedCoordinate.xyz;
    float distToAttractor = packedCoordinate.w;

    vec3 mvPosition = (modelViewMatrix * vec4(localPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);

    float t = easeIn(inverseLerp(0.0, 5.0, distToAttractor), 4.0);
    gl_PointSize = mix(20.0, 150.0, t) / -mvPosition.z;

    vColor = mix(
      vec4(0.1, 0.4, 1.0, 1.0),
      vec4(1.0),
      smoothstep(0.25, 0.0, distToAttractor));
    vColor = mix(
        vColor,
        vec4(32.0, 0.25, 0.05, 1.0),
        smoothstep(0.25, 2.0, distToAttractor));
    vColor.w = smoothstep(0.25, 2.0, distToAttractor);
}
`

const statefulDrawFragmentShader = `
precision highp float;

uniform sampler2D u_diffuse_texture;

out vec4 out_Color;

in vec4 vColor;

void main(){
    vec4 diffuseSample = texture(u_diffuse_texture, gl_PointCoord);

    float alpha = diffuseSample.x;

    // out_Color = diffuseSample * vColor;
    // out_Color.w *= 0.1;
    out_Color = diffuseSample * vColor * alpha;
    out_Color.a = alpha * (1.0 - vColor.a);
}
`

const bitonicVertexShader = `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const bitonicFragmentShader = `
precision highp float;
precision highp sampler2D;

uniform sampler2D u_data_texture;
uniform int stage;
uniform int offset;
uniform int stepno;

uniform vec3 u_camera_position;

out vec4 out_Color;


//------------------------------------------------------------------------------

ivec2 unpack2D(int index, ivec2 dims) {
  return ivec2(index % dims.x, index / dims.x);
}

int pack2D(ivec2 index, ivec2 dims) {
  return index.x + index.y * dims.x;
}

//------------------------------------------------------------------------------


// Main function for bitonic sorting
void main() {

  ivec2 dataTextureDims = textureSize(u_data_texture, 0);

  // Cut off the decimal point for next indexing
  ivec2 pixelIndex = ivec2(gl_FragCoord.xy - 0.5);

  // Find the 1-dimensional index
  int pixelIndex1D = pack2D(pixelIndex, dataTextureDims);

  // Which texel to compare with, above or below?
  int csign = (pixelIndex1D % stage < offset) ? 1 : -1;

  // Sort direction
  int cdir = ((pixelIndex1D / stepno) % 2 == 0) ? 1 : -1;

  // Read the texel at the rendering position
  vec4 val0 = texelFetch(u_data_texture, ivec2(gl_FragCoord.xy), 0);

  // Read the texel to sort
  int cmpPixelIndex = csign * offset + pixelIndex1D;

  vec4 val1 = texelFetch(
      u_data_texture, unpack2D(cmpPixelIndex, dataTextureDims), 0);

  // Values to compare
  float cmpValue0 = distance(val0.xyz, u_camera_position);
  float cmpValue1 = distance(val1.xyz, u_camera_position);

  vec4 cmin = (cmpValue0 < cmpValue1) ? val0: val1;  // The smaller one.
  vec4 cmax = (cmpValue0 <= cmpValue1) ? val1: val0; // The larger one.

  // Compare the sort direction with the data sample direction to decide which value to use.
  out_Color = (csign == cdir) ? cmax : cmin;
}
`

const copyVertexShader = `
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUV;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
  vUV = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const copyFragmentShader = `
precision highp float;
precision highp sampler2D;

uniform sampler2D srcBuffer;

in vec2 vUV;

out vec4 out_Color;

void main() {
  out_Color = texture(srcBuffer, vUV);
}
`

const SHADERS = {
  'stateful-init': [statefulInitVertexShader, statefulInitFragmentShader],
  'stateful-update': [statefulUpdateVertexShader, statefulUpdateFragmentShader],
  'stateful-draw': [statefulDrawVertexShader, statefulDrawFragmentShader],
  'bitonic-sort': [bitonicVertexShader, bitonicFragmentShader],
  'copy-pass': [copyVertexShader, copyFragmentShader],
} as const satisfies Record<string, readonly [string, string]>

type PassName = keyof typeof SHADERS
type PassUniforms = Record<string, THREE.IUniform<unknown>>
type PassOptions = {
  uniforms?: PassUniforms
} & Partial<THREE.RawShaderMaterial>

type BuffName =
  | 'particles-0'
  | 'particles-1'
  | 'particles-2'
  | 'sort-0'
  | 'sort-1'
  | 'sorted-particles'

const NUM_PARTICLES = 512

class GPUParticlesStatefulScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)
  blendTiming = 0

  private fullscreenScene: THREE.Scene | null = null
  private fullscreenCamera: THREE.OrthographicCamera | null = null
  private fullscreenQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial> | null = null

  private passes: Partial<Record<PassName, THREE.RawShaderMaterial>> = {}
  private buffers: Partial<Record<BuffName, THREE.WebGLRenderTarget>> = {}

  uiState = {}

  private particleBufferIndex: number = 0
  private sortIndex: number = 0

  async init(): Promise<void> {
    super.init()

    if (!this.playgroundEl) {
      console.error('Playground element not initialized')
      return
    }

    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping

    this.playgroundEl.appendChild(this.renderer.domElement)

    this.initDebugUI()

    const fov = 60
    const aspect = this.width / this.height
    const near = 0.1
    const far = 1000
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
    this.camera.position.set(9, 2, -5)
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controls.minDistance = 1
    controls.maxDistance = 10
    controls.update()

    this.scene.background = new THREE.Color(0x000000)
    // Scene tweaks
    this.scene.backgroundBlurriness = 0.0
    this.scene.backgroundIntensity = 0.05
    this.scene.environmentIntensity = 0.05

    await this.setupProject()

    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.loadRGBE('/skybox/moonless_golf_2k.hdr')

    this.uniforms = {}

    // this.camera.position.set(2.6, 2.2, 9.4)

    this.setupFullscreenQuad()
    await this.setupGPUParticlesStateful()
  }

  private createTextMesh(font: Font, text: string) {
    const textGeo = new TextGeometry(text, {
      font: font,
      size: 1,
      depth: 0.5,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.05,
    })
    textGeo.computeBoundingBox()
    const centerOffset = -0.5 * (textGeo.boundingBox!.max.x - textGeo.boundingBox!.min.x)
    textGeo.translate(centerOffset, 0, 0)

    return new THREE.Mesh(textGeo, new THREE.MeshBasicMaterial())
  }

  private async createMesh_DataTexture() {
    const data = new Float32Array(NUM_PARTICLES * NUM_PARTICLES * 4)

    // First sampling mesh
    const font = await this.loadFont('/fonts/optimer_bold.typeface.json')
    const textMesh = this.createTextMesh(font, 'GPU Particles!!')
    const sampler = new MeshSurfaceSampler(textMesh).build()

    const pt = new THREE.Vector3()
    for (let i = 0; i < NUM_PARTICLES * NUM_PARTICLES; i++) {
      sampler.sample(pt)
      data[i * 4 + 0] = pt.x
      data[i * 4 + 1] = pt.y
      data[i * 4 + 2] = pt.z
      data[i * 4 + 3] = 0
    }

    const dataTexture = new THREE.DataTexture(data, NUM_PARTICLES, NUM_PARTICLES)
    dataTexture.format = THREE.RGBAFormat
    dataTexture.type = THREE.FloatType
    dataTexture.needsUpdate = true

    return dataTexture
  }

  private setupFullscreenQuad() {
    this.fullscreenScene = new THREE.Scene()
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const fsQuadGeo = new THREE.PlaneGeometry(2, 2)
    const fsQuad = new THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>(
      fsQuadGeo,
      new THREE.RawShaderMaterial(),
    )

    this.fullscreenQuad = fsQuad
    this.fullscreenScene.add(fsQuad)
  }

  private async createShader(
    vertexShader: string,
    fragmentShader: string,
    uniforms: { [uniform: string]: THREE.IUniform<any> },
  ) {
    uniforms = Object.assign(uniforms, {
      time: { value: 0 },
      timeElapsed: { value: 0 },
    })

    return new THREE.RawShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    })
  }

  private createBuffer(name: BuffName) {
    const opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    this.buffers[name] = new THREE.WebGLRenderTarget(NUM_PARTICLES, NUM_PARTICLES, opts)
  }

  private async createPass(name: PassName, opts: PassOptions = {}) {
    const { uniforms = {}, ...materialOverrides } = opts
    const [vertexShader, fragmentShader] = SHADERS[name]
    const pass = await this.createShader(vertexShader, fragmentShader, uniforms)

    Object.assign(pass, materialOverrides)

    this.passes[name] = pass
  }

  private renderPass(name: PassName, bufferName: BuffName) {
    const buffer = this.buffers[bufferName]
    const pass = this.passes[name]

    if (!this.fullscreenQuad || !pass || !buffer) {
      return
    }

    this.renderer.setRenderTarget(buffer)
    this.fullscreenQuad.material = pass
    this.renderer.render(this.fullscreenScene!, this.fullscreenCamera!)
    this.renderer.setRenderTarget(null)
  }

  private async setupGPUParticlesStateful() {
    const diffuseTexture = await this.loadTexture('/textures/circle.png')
    const dataTexture = await this.createMesh_DataTexture()

    // Create an initialize shader
    await this.createPass('stateful-init', {
      uniforms: {
        u_data_texture: { value: dataTexture },
      },
    })

    this.createBuffer('particles-0')
    this.createBuffer('particles-1')
    this.createBuffer('particles-2')
    this.particleBufferIndex = 0

    this.renderPass('stateful-init', 'particles-0')
    this.renderPass('stateful-init', 'particles-1')
    this.renderPass('stateful-init', 'particles-2')

    // Create an update shader
    await this.createPass('stateful-update', {
      uniforms: {
        u_current_buffer: { value: null },
        u_previous_buffer: { value: null },
        u_time: { value: 0 },
        u_time_elapsed: { value: 0 },
        u_data_texture: { value: dataTexture },
      },
    })

    // Create a drawing shader
    const pointGeometry = new THREE.BufferGeometry()
    const positions = []

    for (let i = 0; i < NUM_PARTICLES * NUM_PARTICLES; ++i) {
      positions.push(i)
    }

    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 1))

    await this.createPass('stateful-draw', {
      uniforms: {
        u_time: { value: 0 },
        u_data_texture: { value: null },
        u_resolution: { value: new THREE.Vector2(NUM_PARTICLES, NUM_PARTICLES) },
        u_diffuse_texture: { value: diffuseTexture },
      },
      transparent: true,
      // blending: THREE.AdditiveBlending,
      // blending: THREE.NormalBlending,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })

    const matDraw = this.passes['stateful-draw']

    const pointMesh = new THREE.Points(pointGeometry, matDraw)
    pointGeometry.boundingBox = null
    pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)

    this.scene.add(pointMesh)

    // Sort passes
    await this.createPass('bitonic-sort', {
      uniforms: {
        u_data_texture: { value: null },
        stage: { value: 0 },
        offset: { value: 0 },
        stepno: { value: 0 },
        u_camera_position: { value: new THREE.Vector3() },
      },
    })

    this.createBuffer('sort-0')
    this.createBuffer('sort-1')
    this.sortIndex = 0

    this.createBuffer('sorted-particles')

    // Create the copy pass
    await this.createPass('copy-pass', {
      uniforms: {
        srcBuffer: { value: null },
      },
    })
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    const elapsedTime = this.clock.getDelta()
    const totalTime = this.clock.getElapsedTime()

    for (const pass of Object.values(this.passes)) {
      if (!pass) {
        continue
      }

      const uniforms = pass.uniforms as Record<string, THREE.IUniform<unknown>>

      if (uniforms.u_time) {
        uniforms.u_time.value = totalTime
      }

      if (uniforms.u_time_elapsed) {
        uniforms.u_time_elapsed.value = elapsedTime
      }
    }

    const i1 = this.particleBufferIndex
    const i0 = (i1 + 2) % 3
    this.particleBufferIndex = (i1 + 1) % 3

    const matUpdate = this.passes['stateful-update']
    const particlesBuff0 = ('particles-' + i0) as BuffName
    const particlesBuff1 = ('particles-' + i1) as BuffName
    matUpdate!.uniforms.u_current_buffer.value = this.buffers[particlesBuff1]!.texture
    matUpdate!.uniforms.u_previous_buffer.value = this.buffers[particlesBuff0]!.texture

    this.renderer.render(this.scene, this.camera)
    this.onRender()

    stats.end()
  }

  private copyBuffer(srcName: BuffName, dstName: BuffName) {
    const srcBuffer = this.buffers[srcName]
    const dstBuffer = this.buffers[dstName]
    const copy = this.passes['copy-pass']
    copy!.uniforms.srcBuffer.value = srcBuffer!.texture

    this.renderPass('copy-pass', dstName)
  }

  private sortParticles() {
    const bitonicSortMat = this.passes['bitonic-sort']

    if (!bitonicSortMat) {
      return
    }

    // Copy the particle buffer to the sort buffer
    let srcBuffName = ('particles-' + this.particleBufferIndex) as BuffName
    const dstBuffName = ('sort-' + this.sortIndex) as BuffName
    this.copyBuffer(srcBuffName, dstBuffName)

    for (let i = 0; i < 1000; ++i) {
      let step = i
      let rank
      for (rank = 0; rank < step; ++rank) {
        step -= rank + 1
      }

      let stepno = 1 << (rank + 1)
      let offset = 1 << (rank - step)
      let stage = 2 * offset

      if (rank >= Math.log2(NUM_PARTICLES * NUM_PARTICLES)) {
        break
      }

      // Draw the sort material
      const target = ('sort-' + ((this.sortIndex + 1) % 2)) as BuffName
      const sortBuffName = ('sort-' + this.sortIndex) as BuffName
      const sourceBuffer = this.buffers[sortBuffName]

      bitonicSortMat.uniforms.u_data_texture.value = sourceBuffer!.texture
      bitonicSortMat.uniforms.stage.value = stage
      bitonicSortMat.uniforms.offset.value = offset
      bitonicSortMat.uniforms.stepno.value = stepno
      bitonicSortMat.uniforms.u_camera_position.value.copy(this.camera.position)
      bitonicSortMat.needsUpdate = true

      this.renderPass('bitonic-sort', target)

      this.sortIndex = (this.sortIndex + 1) % 2
    }

    srcBuffName = ('sort-' + this.sortIndex) as BuffName
    this.copyBuffer(dstBuffName, 'sorted-particles')
  }

  onRender(): void {
    const bufferName = ('particles-' + this.particleBufferIndex) as BuffName
    this.renderPass('stateful-update', bufferName)

    this.sortParticles()

    // const currentParticleBuffer = this.buffers[bufferName]
    const sortedParticleBuffer = this.buffers['sorted-particles']

    const matDraw = this.passes['stateful-draw']
    matDraw!.uniforms.u_data_texture.value = sortedParticleBuffer!.texture
  }

  private initDebugUI() {}

  onResize(): void {
    const aspect = this.width / this.height

    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  scene = new GPUParticlesStatefulScene()
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
