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

void main(){
  vec3 currentPosition = texture(u_current_buffer, v_uvs).xyz;
  vec3 previousPosition = texture(u_previous_buffer, v_uvs).xyz;
  vec3 deltaPosition = currentPosition - previousPosition;

  // Verlet integration
  vec3 forces = vec3(0.0);
  float drag = 0.25;

  // Apply forces

  // Apply an attractor force
  AttractorParams attractorParams = AttractorParams(
      texture(u_data_texture, v_uvs).xyz, 1.0, 500.0, 1.0);
  forces += CalculateAttractorForce(currentPosition, attractorParams);

  // Create repulsor force
  vec3 repulsor = vec3(sin(u_time * 0.25) * 8.0, 0.0, 0.0);
  float distToRepulsor = distance(currentPosition, repulsor);
  {
    float repulsorRadius = 1.0;
    float distOverRadius = distToRepulsor / repulsorRadius;

    // Soft repulsor
    float decay = 1.0;
    float repulsorIntensity = 1000.0;
    float repulsorForce = repulsorIntensity * (
        exp(-distOverRadius * decay));
    vec3 dirToRepulsor = -normalize(repulsor - currentPosition);
    forces += dirToRepulsor * repulsorForce;
  }

  float noiseIntensity = 20.0;
  forces += curlNoise(vec4(currentPosition, u_time * 0.5)) * noiseIntensity;

  vec3 newPosition = currentPosition + deltaPosition * drag + (
      forces * u_time_elapsed * u_time_elapsed);

  out_Color = vec4(newPosition, distToRepulsor);
}
`

const statefulVertexShader = `
precision highp float;
precision highp sampler2DArray;

in float position;

out vec4 vColor;

uniform sampler2D u_data_texture;
uniform float u_time;
uniform vec2 u_resolution;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

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

    vec3 mvPosition = (modelViewMatrix * vec4(localPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);
    gl_PointSize = 10.0 / -mvPosition.z;

    vColor = mix(
      vec4(1.0),
      vec4(1.0, 0.0, 0.0, 1.0),
      smoothstep(2.0, 1.0, packedCoordinate.w));
}
`

const statefulFragmentShader = `
precision highp float;

uniform sampler2D u_diffuse_texture;

out vec4 out_Color;

in vec4 vColor;

void main(){
    vec4 diffuseSample = texture(u_diffuse_texture, gl_PointCoord);

    out_Color = diffuseSample * vColor;
    out_Color.w *= 0.1;
}
`

class GPUParticlesStatefulScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)
  blendTiming = 0

  private fullscreenScene: THREE.Scene | null = null
  private fullscreenCamera: THREE.OrthographicCamera | null = null

  uiState = {}

  private materials: THREE.ShaderMaterial[] = []
  private particleBuffers: THREE.WebGLRenderTarget[] = []
  private particleBufferIndex: number = 0
  particleUpdateQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial> | null = null
  particleDrawMaterial: THREE.RawShaderMaterial | null = null

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

  private async setupGPUParticlesStateful() {
    // First sampling mesh
    const font = await this.loadFont('/fonts/optimer_bold.typeface.json')
    const textMesh = this.createTextMesh(font, 'GPU Particles!!')

    const sampler = new MeshSurfaceSampler(textMesh).build()

    const pt = new THREE.Vector3()

    const NUM_PARTICLES = 1024
    const data = new Float32Array(NUM_PARTICLES * NUM_PARTICLES * 4)

    for (let i = 0; i < NUM_PARTICLES * NUM_PARTICLES; ++i) {
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

    // TODO: Remember to release the geometries

    this.fullscreenScene = new THREE.Scene()
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const fsQuadGeo = new THREE.PlaneGeometry(2, 2)

    // Create an initializer shader
    const matInitialize = new THREE.RawShaderMaterial({
      uniforms: {
        u_data_texture: { value: dataTexture },
      },
      vertexShader: statefulInitVertexShader,
      fragmentShader: statefulInitFragmentShader,
      depthWrite: false,
      depthTest: false,
      glslVersion: THREE.GLSL3,
    })

    const opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    const fsQuad = new THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>(
      fsQuadGeo,
      matInitialize,
    )
    this.fullscreenScene.add(fsQuad)

    this.particleBuffers = [
      new THREE.WebGLRenderTarget(NUM_PARTICLES, NUM_PARTICLES, opts),
      new THREE.WebGLRenderTarget(NUM_PARTICLES, NUM_PARTICLES, opts),
      new THREE.WebGLRenderTarget(NUM_PARTICLES, NUM_PARTICLES, opts),
    ]
    this.particleBufferIndex = 0

    for (let i = 0; i < this.particleBuffers.length; ++i) {
      this.renderer.setRenderTarget(this.particleBuffers[i])
      this.renderer.render(this.fullscreenScene, this.fullscreenCamera)
    }
    this.renderer.setRenderTarget(null)

    // Create an update shader
    const matUpdate = new THREE.RawShaderMaterial({
      uniforms: {
        u_current_buffer: { value: null },
        u_previous_buffer: { value: null },
        u_time: { value: 0 },
        u_time_elapsed: { value: 0 },
        u_data_texture: { value: dataTexture },
      },
      vertexShader: statefulUpdateVertexShader,
      fragmentShader: statefulUpdateFragmentShader,
      depthWrite: false,
      depthTest: false,
      glslVersion: THREE.GLSL3,
    })

    this.particleUpdateQuad = fsQuad
    this.particleUpdateQuad.material = matUpdate

    // Create a drawing shader
    const pointGeometry = new THREE.BufferGeometry()
    const positions = []

    for (let i = 0; i < NUM_PARTICLES * NUM_PARTICLES; ++i) {
      positions.push(i)
    }

    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 1))

    const diffuseTexture = await this.loadTexture('/textures/circle.png')

    const matDraw = new THREE.RawShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_data_texture: { value: this.particleBuffers[0].texture },
        u_resolution: { value: new THREE.Vector2(NUM_PARTICLES, NUM_PARTICLES) },
        u_diffuse_texture: { value: diffuseTexture },
      },
      vertexShader: statefulVertexShader,
      fragmentShader: statefulFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      glslVersion: THREE.GLSL3,
    })

    const pointMesh = new THREE.Points(pointGeometry, matDraw)
    pointGeometry.boundingBox = null
    pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)

    this.scene.add(pointMesh)

    this.particleDrawMaterial = matDraw

    this.materials.push(matDraw)
    this.materials.push(matUpdate)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    if (!this.particleUpdateQuad) {
      return
    }

    const elapsedTime = this.clock.getDelta()
    const totalTime = this.clock.getElapsedTime()

    this.materials.forEach((mat) => {
      mat.uniforms.u_time.value = totalTime
    })

    const currentBuffer = this.particleBuffers[this.particleBufferIndex]
    const previousBuffer = this.particleBuffers[(this.particleBufferIndex + 2) % 3]
    this.particleBufferIndex = (this.particleBufferIndex + 1) % 3

    const updateMaterial = this.particleUpdateQuad.material
    updateMaterial.uniforms.u_current_buffer.value = currentBuffer.texture
    updateMaterial.uniforms.u_previous_buffer.value = previousBuffer.texture
    updateMaterial.uniforms.u_time_elapsed.value = elapsedTime
    updateMaterial.needsUpdate = true

    this.renderer.render(this.scene, this.camera)
    this.onRender()

    stats.end()
  }

  onRender(): void {
    this.renderer.setRenderTarget(this.particleBuffers[this.particleBufferIndex])
    this.renderer.render(this.fullscreenScene!, this.fullscreenCamera!)
    this.renderer.setRenderTarget(null)

    this.particleDrawMaterial!.uniforms.u_data_texture.value =
      this.particleBuffers[this.particleBufferIndex].texture
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
