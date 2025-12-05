<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import Stats from 'stats.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Scene } from '@/shared/scene/scene'
import * as MATH from '@/shared/math/math'
import {
  Emitter,
  EmitterParams,
  ParticleRenderer,
  ParticleSystem,
  PointShape,
  ParticleRendererParams,
} from '@/shared/particles/particle-system'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: BasicParticlesScene

const stats = new Stats()
stats.showPanel(0)
stats.dom.style.position = 'absolute'
stats.dom.style.left = 'unset'
stats.dom.style.right = '300px'
stats.dom.style.top = '0px'
document.body.appendChild(stats.dom)

const vertexShader = `
attribute vec2 particle_data;

uniform sampler2D u_size_over_life;
uniform sampler2D u_color_over_life;
uniform sampler2D u_twinkle_over_life;
uniform float u_time;
uniform float u_spin_speed;

varying float v_angle;
varying vec4 v_color;

void main() {
    float life = particle_data.x;
    float p_id = particle_data.y;

    float size_sample = texture2D(u_size_over_life, vec2(life, 0.5)).x;
    vec4 color_sample = texture2D(u_color_over_life, vec2(life, 0.5));
    float twinkle_sample = texture2D(u_twinkle_over_life, vec2(life, 0.5)).x;
    float twinkle = mix(1.0, sin(u_time * 20.0 + p_id * 6.28) * 0.5 + 0.5, twinkle_sample);

    // position, projectionMatrix, modelViewMatrix are provided by THREE.js
    vec4 local_position = vec4(position, 1.0);
    vec3 mv_position = (modelViewMatrix * local_position).xyz;

    gl_Position = projectionMatrix * vec4(mv_position, 1.0);
    gl_PointSize = size_sample * 300.0 / -mv_position.z;

    v_angle = u_spin_speed * u_time + p_id * 6.28;
    v_color = color_sample;
    v_color.a *= twinkle;
}
`

const fragmentShader = `
uniform sampler2D u_map;

varying float v_angle;
varying vec4 v_color;

void main() {
    vec2 uv = gl_PointCoord.xy;

    float c = cos(v_angle);
    float s = sin(v_angle);
    mat2 r = mat2(c, s, -s, c);

    uv = (uv - 0.5) * r + 0.5;

    vec4 texel = texture2D(u_map, uv);
    gl_FragColor = texel * v_color;
}
`

type Particle = {
  life: number
  maxLife: number
  size: number
  angle: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  alpha: number
  color: number
}

class BasicParticlesScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)

  uiState = {}

  private starMaterial: THREE.ShaderMaterial | null = null
  private smokeMaterial: THREE.ShaderMaterial | null = null

  // Particle system
  private particleSystem: ParticleSystem | null = new ParticleSystem()
  private particles: Particle[] = []
  private particlesGeometry = new THREE.BufferGeometry()

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
    this.camera.position.set(80, 20, 80)
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 20, 0)
    controls.update()

    this.scene.background = new THREE.Color(0x000000)
    // Scene tweaks
    this.scene.backgroundBlurriness = 0.0
    this.scene.backgroundIntensity = 0.01
    this.scene.environmentIntensity = 1.0

    await this.setupProject()

    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame))
  }

  async setupProject(): Promise<void> {
    this.loadRGBE('/skybox/moonless_golf_2k.hdr')

    this.uniforms = {}

    // Load star texture
    const loader = new THREE.TextureLoader()
    const startTexture = loader.load('/textures/star.png')
    const smokeTexture = loader.load('/textures/smoke.png')

    // Smoke Material
    {
      const sizeOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 5 },
        { time: 5, value: 15 },
      ])

      const alphaOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 1, value: 1 },
        { time: 5, value: 0 },
      ])

      const colorOverlife = new MATH.ColorInterpolant([
        // { time: 0, value: new THREE.Color(0x808080) },
        // { time: 1, value: new THREE.Color(0x404040) },
        { time: 0, value: new THREE.Color().setHSL(0, 1, 0.5) },
        { time: 1, value: new THREE.Color().setHSL(0.25, 1, 0.5) },
        { time: 2, value: new THREE.Color().setHSL(0.5, 1, 0.5) },
        { time: 3, value: new THREE.Color().setHSL(0.75, 1, 0.5) },
        { time: 4, value: new THREE.Color().setHSL(1, 1, 0.5) },
      ])

      const twinkleOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 1, value: 0 },
      ])

      this.smokeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_spin_speed: { value: 0 },
          u_map: {
            value: smokeTexture,
          },
          u_size_over_life: {
            value: sizeOverlife.toTexture(),
          },
          u_color_over_life: {
            value: colorOverlife.toTexture(alphaOverlife),
          },
          u_twinkle_over_life: {
            value: twinkleOverlife.toTexture(),
          },
        },
        vertexShader,
        fragmentShader,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
    }

    // Star Material
    {
      const sizeOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 2 },
        { time: 0.1, value: 5 },
        { time: 5, value: 0 },
      ])

      const alphaOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 0.25, value: 1 },
        { time: 4.5, value: 1 },
        { time: 5, value: 0 },
      ])

      const colorOverlife = new MATH.ColorInterpolant([
        { time: 0, value: new THREE.Color().setHSL(0, 1, 0.75) },
        { time: 2, value: new THREE.Color().setHSL(0.5, 1, 0.5) },
        { time: 5, value: new THREE.Color().setHSL(1, 1, 0.5) },
      ])

      const twinkleOverlife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 4, value: 1 },
        { time: 5, value: 1 },
      ])

      this.starMaterial = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_spin_speed: { value: 0 },
          u_map: {
            value: startTexture,
          },
          u_size_over_life: {
            value: sizeOverlife.toTexture(),
          },
          u_color_over_life: {
            value: colorOverlife.toTexture(alphaOverlife),
          },
          u_twinkle_over_life: {
            value: twinkleOverlife.toTexture(),
          },
        },
        vertexShader,
        fragmentShader,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
    }

    this.createParticleSystem()
  }

  private createParticleSystem() {
    this.particleSystem = new ParticleSystem()

    const emitterParams = new EmitterParams()
    emitterParams.shape = new PointShape()
    emitterParams.emissionRate = 1
    emitterParams.maxParticles = 3
    emitterParams.maxEmission = Number.MAX_SAFE_INTEGER
    emitterParams.maxLife = 4
    emitterParams.gravity = true
    emitterParams.velocityMagnitude = 50
    emitterParams.rotation = new THREE.Quaternion()
    emitterParams.rotationAngularVariance = Math.PI / 8
    emitterParams.spinSpeed = Math.PI

    emitterParams.onCreate = (particle) => {
      const smokeEmitterParams = new EmitterParams()
      smokeEmitterParams.shape = new PointShape()
      smokeEmitterParams.shape.positionRadiusVariance = 2
      smokeEmitterParams.emissionRate = 50
      smokeEmitterParams.maxParticles = 500
      smokeEmitterParams.maxEmission = Number.MAX_SAFE_INTEGER
      smokeEmitterParams.maxLife = 5
      smokeEmitterParams.spinSpeed = Math.PI / 8
      smokeEmitterParams.velocityMagnitude = 5
      smokeEmitterParams.rotationAngularVariance = Math.PI / 8

      const rendererParams = new ParticleRendererParams()
      rendererParams.maxParticles = smokeEmitterParams.maxParticles

      smokeEmitterParams.renderer = new ParticleRenderer()
      smokeEmitterParams.renderer.initialize(this.smokeMaterial!.clone(), rendererParams)

      const smokeEmitter = new Emitter(smokeEmitterParams)

      this.particleSystem!.addEmitter(smokeEmitter)

      this.scene.add(rendererParams.group)

      particle.attachedEmitter = smokeEmitter
      particle.attachedShape = smokeEmitterParams.shape
    }

    emitterParams.onStep = (particle) => {
      particle.attachedShape!.position.copy(particle.position)
    }

    emitterParams.onDestroy = (particle) => {
      particle.attachedEmitter!.stop()
      this.createPopParticleSystem(particle.position)
    }

    const rendererParams = new ParticleRendererParams()
    rendererParams.maxParticles = emitterParams.maxParticles

    // emitterParams.renderer = new ParticleRenderer()
    // emitterParams.renderer.initialize(this.starMaterial!.clone(), rendererParams)

    const emitter = new Emitter(emitterParams)
    this.particleSystem.addEmitter(emitter)

    this.scene.add(rendererParams.group)
  }

  private createPopParticleSystem(position: THREE.Vector3) {
    const emitterParams = new EmitterParams()
    emitterParams.shape = new PointShape()
    emitterParams.shape.position.copy(position)
    emitterParams.emissionRate = 5000
    emitterParams.maxParticles = 500
    emitterParams.maxEmission = 500
    emitterParams.maxLife = 3
    emitterParams.gravity = true
    emitterParams.dragCoefficient = 4
    emitterParams.velocityMagnitude = 75
    emitterParams.velocityMagnitudeVariance = 10
    emitterParams.rotationAngularVariance = 2 * Math.PI
    emitterParams.spinSpeed = Math.PI

    const rendererParams = new ParticleRendererParams()
    rendererParams.maxParticles = emitterParams.maxParticles

    emitterParams.renderer = new ParticleRenderer()
    emitterParams.renderer.initialize(this.starMaterial!.clone(), rendererParams)

    const emitter = new Emitter(emitterParams)

    this.particleSystem!.addEmitter(emitter)

    this.scene.add(rendererParams.group)
  }

  private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
    this.renderer.render(this.scene, this.camera)

    if (!this.particleSystem) {
      return
    }

    stats.begin()
    const elapsedTime = this.clock.getDelta()
    const totalTime = this.clock.getElapsedTime()

    this.particleSystem.step(elapsedTime, totalTime)

    if (!this.particleSystem.stillActive) {
      this.particleSystem.dispose()
      this.particleSystem = null
      // this.createParticleSystem()
    }

    stats.end()
  }

  private initDebugUI() {}

  private createPointsParticleSystem() {
    const geometry = new THREE.BufferGeometry()

    const positions = []
    const sizes = []
    const angles = []
    const alpha = []
    const colors = []
    const life = []

    // Load star texture
    const loader = new THREE.TextureLoader()
    const startTexture = loader.load('/textures/star.png')

    for (let i = 0; i < 1000; ++i) {
      const x = (MATH.random() * 2 - 1) * 100
      const y = (MATH.random() * 2 - 1) * 100
      const z = (MATH.random() * 2 - 1) * 100
      positions.push(x, y, z)
      sizes.push(10 + (i % 10))
      angles.push(Math.PI * ((i % 10) / 5))
      alpha.push(1)
      life.push(0)

      const c = new THREE.Color().setHSL(MATH.random(), 1, 0.5)
      colors.push(c.r, c.g, c.b)

      const dir = new THREE.Vector3(x, y, z).normalize()

      this.particles.push({
        life: 0,
        maxLife: 4,
        alpha: alpha[i],
        size: sizes[i],
        angle: angles[i],
        color: colors[i],
        position: new THREE.Vector3(x, y, z),
        velocity: dir.multiplyScalar(100),
      })
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
    geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1))
    geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(angles, 1))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('life', new THREE.Float32BufferAttribute(life, 1))

    // Set dynamic draw usage on every attribute we plan on updating
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute
    const sizeAttr = geometry.attributes.size as THREE.BufferAttribute
    const angleAttr = geometry.attributes.angle as THREE.BufferAttribute
    const alphaAttr = geometry.attributes.alpha as THREE.BufferAttribute
    const lifeAttr = geometry.attributes.alpha as THREE.BufferAttribute

    positionAttr.setUsage(THREE.DynamicDrawUsage)
    sizeAttr.setUsage(THREE.DynamicDrawUsage)
    angleAttr.setUsage(THREE.DynamicDrawUsage)
    alphaAttr.setUsage(THREE.DynamicDrawUsage)
    lifeAttr.setUsage(THREE.DynamicDrawUsage)

    this.particlesGeometry = geometry

    // const material = new THREE.PointsMaterial({
    //   color: 0xffffff,
    //   size: 10,
    //   map: startTexture,
    //   sizeAttenuation: true,
    //   depthWrite: false,
    //   depthTest: true,
    //   transparent: true,
    //   blending: THREE.NormalBlending,
    // })

    const sizeOverlife = new MATH.FloatInterpolant([
      { time: 0, value: 0 },
      { time: 1, value: 100 },
      { time: 2, value: 0 },
      { time: 3, value: 200 },
      { time: 4, value: 0 },
    ])

    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_map: {
          value: startTexture,
        },
        u_size_over_life: {
          value: sizeOverlife.toTexture(),
        },
      },
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      blending: THREE.NormalBlending,
    })

    const particles = new THREE.Points(geometry, material)

    this.scene.add(particles)
  }

  stepParticles(timeElapsed: number) {
    if (!this.particlesGeometry) {
      return
    }

    const positions = []
    const sizes = []
    const angles = []
    const alpha = []
    const colors = []
    const life = []

    const gravity = new THREE.Vector3(0, -9.8, 0)

    const colorOverlife = new MATH.ColorInterpolant([
      { time: 0, value: new THREE.Color(0xffffff) },
      { time: 1, value: new THREE.Color(0xff0000) },
      { time: 2, value: new THREE.Color(0x00ff00) },
      { time: 3, value: new THREE.Color(0x0000ff) },
      { time: 4, value: new THREE.Color(0xffffff) },
    ])

    const alphaOverlife = new MATH.FloatInterpolant([
      { time: 0, value: 0 },
      { time: 1, value: 1 },
      { time: 4, value: 0 },
    ])

    for (let i = 0; i < this.particles.length; ++i) {
      const p = this.particles[i]

      p.life += timeElapsed
      p.life = Math.min(p.life, p.maxLife)

      p.angle += timeElapsed

      // Update position based on velocity and gravity
      const forces = gravity.clone()
      const drag = -0.1
      forces.add(p.velocity.clone().multiplyScalar(drag))

      p.velocity.add(forces.multiplyScalar(timeElapsed))

      const displacement = p.velocity.clone().multiplyScalar(timeElapsed)
      // p.position.add(displacement)

      // if (p.life < 1) {
      //   p.alpha = p.life
      // } else if (p.life > p.maxLife - 1) {
      //   p.alpha = p.maxLife - p.life
      // }

      p.alpha = alphaOverlife.evaluate(p.life)

      positions.push(p.position.x, p.position.y, p.position.z)
      sizes.push(p.size)
      angles.push(p.angle)
      alpha.push(p.alpha)
      life.push(p.life / p.maxLife)

      const c = colorOverlife.evaluate(p.life)
      colors.push(c.r, c.g, c.b)
    }

    this.particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.particlesGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
    this.particlesGeometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1))
    this.particlesGeometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1))
    this.particlesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.particlesGeometry.setAttribute('life', new THREE.Float32BufferAttribute(life, 1))

    this.particlesGeometry.attributes.position.needsUpdate = true
    this.particlesGeometry.attributes.size.needsUpdate = true
    this.particlesGeometry.attributes.angle.needsUpdate = true
    this.particlesGeometry.attributes.alpha.needsUpdate = true
    this.particlesGeometry.attributes.color.needsUpdate = true
    this.particlesGeometry.attributes.life.needsUpdate = true
  }

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

  scene = new BasicParticlesScene()
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
