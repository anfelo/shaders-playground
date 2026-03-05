<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Scene } from '@/shared/scene/scene'
import { useStats } from '@/composables/stats'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

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

class GPUParticlesStatelessScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)

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
    this.camera.position.set(20, 1, 20)
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 8, 0)
    controls.update()

    this.scene.background = new THREE.Color(0x000000)
    // Scene tweaks
    this.scene.backgroundBlurriness = 0.0
    this.scene.backgroundIntensity = 0.025
    this.scene.environmentIntensity = 0.025

    await this.setupProject()

    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.loadRGBE('/skybox/moonless_golf_2k.hdr')

    this.uniforms = {}

    this.setupGPUParticlesBlendData()
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

    // const elapsedTime = this.clock.getDelta()
    const totalTime = this.clock.getElapsedTime()

    this.materials.forEach((mat) => {
      mat.uniforms.u_time.value = totalTime
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
