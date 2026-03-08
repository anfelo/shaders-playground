<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Scene } from '@/shared/scene/scene'
import { useStats } from '@/composables/stats'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import type { Font } from 'three/addons/loaders/FontLoader.js'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: GPUParticlesStatelessScene

const stats = useStats()

const basicVertexShader = `
void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
    gl_PointSize = 10.0;
}
`

const basicFragmentShader = `
void main(){
    gl_FragColor = vec4(1.0);
}
`

const blendDataVertexShader = `
attribute vec3 position2;

uniform float u_time;

void main() {
    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec3 position1 = position;
    vec3 position2 = position2;

    vec3 localPosition = mix(position1, position2, smoothstep(0.0, 10.0, u_time));

    vec3 mvPosition = (modelViewMatrix * vec4(localPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);
    gl_PointSize = 10.0 / -mvPosition.z;
}
`

const blendDataFragmentShader = `
void main(){
    gl_FragColor = vec4(1.0);
}
`

const blendTextureVertexShader = `
precision highp float;
precision highp sampler2DArray;

in float position;

uniform sampler2DArray u_data_texture;
uniform float u_data_texture_index;
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
    int i0 =  int(u_data_texture_index);
    int i1 = (i0 + 1) % 4;
    float t = smoothstep(0.25, 0.75, fract(u_data_texture_index));

    vec3 packedCoordinate1 = texture(u_data_texture, vec3(uv, float(i0))).xyz;
    vec3 packedCoordinate2 = texture(u_data_texture, vec3(uv, float(i1))).xyz;

    vec3 localPosition = mix(packedCoordinate1, packedCoordinate2, t);

    vec3 mvPosition = (modelViewMatrix * vec4(localPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);
    gl_PointSize = 10.0 / -mvPosition.z;
}
`

const blendTextureFragmentShader = `
precision highp float;

uniform sampler2D u_diffuse_texture;

out vec4 out_Color;

void main(){
    vec4 diffuseSample = texture(u_diffuse_texture, gl_PointCoord);
    out_Color = diffuseSample;
}
`

class GPUParticlesStatelessScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)
  blendTiming = 0

  uiState = {}

  private materials: THREE.ShaderMaterial[] = []

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

    this.setupGPUParticlesBlendTexture()
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

  private async setupGPUParticlesBlendTexture() {
    // First sampling mesh
    // const geo1 = new THREE.SphereGeometry(2, 32, 32)
    // const mat1 = new THREE.MeshBasicMaterial()
    // const mesh1 = new THREE.Mesh(geo1, mat1)
    const font = await this.loadFont('/fonts/optimer_bold.typeface.json')
    const textMesh = this.createTextMesh(font, 'Hello, World!')
    const textMesh2 = this.createTextMesh(font, 'GPU Particles!!')

    const geo2 = new THREE.TorusKnotGeometry(1, 0.3, 100, 16)
    const mat2 = new THREE.MeshBasicMaterial()
    const mesh2 = new THREE.Mesh(geo2, mat2)

    const mat3 = new THREE.MeshBasicMaterial()
    const pumpkin = await this.loadGLTF('/models/pumpkin.glb')
    const geos: THREE.BufferGeometry[] = []
    pumpkin.scene.children[0].position.set(0, 0, 0)
    pumpkin.scene.children[0].scale.setScalar(0.01)

    pumpkin.scene.children[0].traverse((child) => {
      child.updateMatrixWorld()
      if (child instanceof THREE.Mesh && child.geometry) {
        const attribute = child.geometry.getAttribute('position').clone()
        const geometry = new THREE.BufferGeometry()
        if (child.geometry.index) {
          geometry.setIndex(child.geometry.index.clone())
        }
        geometry.setAttribute('position', attribute)
        geometry.applyMatrix4(child.matrixWorld)
        geos.push(geometry)
      }
    })

    const combinedGeometry = BufferGeometryUtils.mergeGeometries(geos)
    const combinedMesh = new THREE.Mesh(combinedGeometry, mat3)

    const sampler1 = new MeshSurfaceSampler(textMesh).build()
    const sampler2 = new MeshSurfaceSampler(mesh2).build()
    const sampler3 = new MeshSurfaceSampler(combinedMesh).build()
    const sampler4 = new MeshSurfaceSampler(textMesh2).build()

    const pointGeometry = new THREE.BufferGeometry()
    const positions = []
    const pt = new THREE.Vector3()

    const NUM_PARTICLES = 256

    for (let i = 0; i < NUM_PARTICLES * NUM_PARTICLES; ++i) {
      positions.push(i)
    }

    // Create data texture from samplers
    const samplers = [sampler1, sampler2, sampler3, sampler4]
    const data = new Float32Array(samplers.length * 4 * NUM_PARTICLES * NUM_PARTICLES)

    for (let i = 0; i < samplers.length; ++i) {
      const curData = new Float32Array(4 * NUM_PARTICLES * NUM_PARTICLES)

      for (let j = 0; j < NUM_PARTICLES * NUM_PARTICLES; ++j) {
        samplers[i].sample(pt)

        curData[j * 4 + 0] = pt.x
        curData[j * 4 + 1] = pt.y
        curData[j * 4 + 2] = pt.z
        curData[j * 4 + 3] = 0
      }

      const offset = i * (4 * NUM_PARTICLES * NUM_PARTICLES)
      data.set(curData, offset)
    }

    const dataTexture = new THREE.DataArrayTexture(
      data,
      NUM_PARTICLES,
      NUM_PARTICLES,
      samplers.length,
    )
    dataTexture.format = THREE.RGBAFormat
    dataTexture.type = THREE.FloatType
    dataTexture.needsUpdate = true

    // TODO: Remember to release the geometries

    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 1))
    const diffuseTexture = await this.loadTexture('/textures/circle.png')

    const pointMaterial = new THREE.RawShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_data_texture: { value: dataTexture },
        u_data_texture_index: { value: 0 },
        u_resolution: { value: new THREE.Vector2(NUM_PARTICLES, NUM_PARTICLES) },
        u_diffuse_texture: { value: diffuseTexture },
      },
      vertexShader: blendTextureVertexShader,
      fragmentShader: blendTextureFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      glslVersion: THREE.GLSL3,
    })

    this.materials.push(pointMaterial)

    const pointMesh = new THREE.Points(pointGeometry, pointMaterial)
    pointGeometry.boundingBox = null
    pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)

    this.scene.add(pointMesh)
  }

  private setupGPUParticlesBlendData() {
    // First sampling mesh
    const geo1 = new THREE.SphereGeometry(2, 32, 32)
    const mat1 = new THREE.MeshBasicMaterial()
    const mesh1 = new THREE.Mesh(geo1, mat1)

    const geo2 = new THREE.TorusKnotGeometry(1, 0.3, 100, 16)
    const mat2 = new THREE.MeshBasicMaterial()
    const mesh2 = new THREE.Mesh(geo2, mat2)

    const sampler1 = new MeshSurfaceSampler(mesh1).build()
    const sampler2 = new MeshSurfaceSampler(mesh2).build()

    const NUM_PARTICLES = 100000
    const pointGeometry = new THREE.BufferGeometry()
    const positions = []
    const positions2 = []
    const pt = new THREE.Vector3()
    for (let i = 0; i < NUM_PARTICLES; ++i) {
      sampler1.sample(pt)
      positions.push(pt.x, pt.y, pt.z)

      sampler2.sample(pt)
      positions2.push(pt.x, pt.y, pt.z)
    }

    // TODO: Remember to release the geometries

    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    pointGeometry.setAttribute('position2', new THREE.Float32BufferAttribute(positions2, 3))

    const pointMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
      },
      vertexShader: blendDataVertexShader,
      fragmentShader: blendDataFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    this.materials.push(pointMaterial)

    const pointMesh = new THREE.Points(pointGeometry, pointMaterial)
    this.scene.add(pointMesh)
  }

  private setupGPUParticlesBasic() {
    const pointGeometry = new THREE.BufferGeometry()
    const positions = [0, 0, 0]

    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const pointMaterial = new THREE.ShaderMaterial({
      vertexShader: basicVertexShader,
      fragmentShader: basicFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    const pointMesh = new THREE.Points(pointGeometry, pointMaterial)
    this.scene.add(pointMesh)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    this.renderer.render(this.scene, this.camera)

    const elapsedTime = this.clock.getDelta()
    const totalTime = this.clock.getElapsedTime()

    this.blendTiming += elapsedTime / 5.0

    const blendIndex = this.blendTiming % 4

    this.materials.forEach((mat) => {
      mat.uniforms.u_time.value = totalTime
      mat.uniforms.u_data_texture_index.value = blendIndex
    })

    stats.end()
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

  scene = new GPUParticlesStatelessScene()
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
