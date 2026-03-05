<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Scene } from '@/shared/scene/scene'
import * as MATH from '@/shared/math/math'
import {
  Emitter,
  EmitterParams,
  ParticleRenderer,
  ParticleSystem,
  PointShape,
  ParticleRendererParams,
  ParticleAttractor,
} from '@/shared/particles/particle-system'
import { useStats } from '@/composables/stats'

const canvasWrapperElement = ref('div')
const elementRef = ref<HTMLElement | null>(null)
let scene: ParticlesBlendingModesScene

const stats = useStats()

const vertexShader = `
attribute vec2 particle_data;

uniform sampler2D u_size_over_life;
uniform sampler2D u_color_over_life;
uniform sampler2D u_twinkle_over_life;
uniform float u_time;
uniform float u_spin_speed;

varying float v_angle;
varying vec4 v_color;
varying vec3 v_world_pos;

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
    v_world_pos = (modelMatrix * local_position).xyz;
}
`

const fragmentShader = `
uniform sampler2D u_map;
uniform float u_light_factor;
uniform float u_light_intensity;

varying float v_angle;
varying vec4 v_color;
varying vec3 v_world_pos;

void main() {
    vec2 uv = gl_PointCoord.xy;

    float x = uv.x - 0.5;
    float y = uv.y - 0.5;
    float z = sqrt(1.0 - x * x - y * y);
    vec3 normal = normalize(vec3(x, y, z * 0.5));

    // Calculate lighting
    vec3 light_pos = vec3(0.0, 4.0, 0.0);
    light_pos = (viewMatrix * vec4(light_pos, 1.0)).xyz;
    vec3 view_pos = (viewMatrix * vec4(v_world_pos, 1.0)).xyz;
    vec3 light_dir = normalize(light_pos - view_pos);
    light_dir.y = -light_dir.y;
    float light_dp = max(dot(normal, light_dir), 0.0);

    // Calculate light falloff
    float falloff = smoothstep(8.0, 12.0, length(light_pos - view_pos));
    vec3 fake_color = mix(vec3(1.0, 0.6, 0.2), vec3(1.0), falloff);

    float c = cos(v_angle);
    float s = sin(v_angle);
    mat2 r = mat2(c, s, -s, c);

    uv = (uv - 0.5) * r + 0.5;

    vec4 texel = texture2D(u_map, uv);

    vec4 final_color = v_color * texel;

    final_color.rgb *= mix(vec3(1.0), light_dp * fake_color * u_light_intensity, u_light_factor);
    final_color.rgb *= final_color.a;
    final_color.a *= mix(0.0, falloff, u_light_factor);

    // vec4 alpha_blended = vec4(final_color.rgb * final_color.a, final_color.a);
    // vec4 additive_blended = vec4(final_color.rgb * final_color.a, 0.0);

    gl_FragColor = final_color;
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

class ParticlesBlendingModesScene extends Scene {
  camera = new THREE.PerspectiveCamera()

  playgroundEl = elementRef.value

  totalTime: number = 0.0
  clock = new THREE.Clock(true)

  uiState = {}

  private starMaterial: THREE.ShaderMaterial | null = null
  private smokeMaterial: THREE.ShaderMaterial | null = null

  private campfireLight: THREE.PointLight | null = null

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

    // Create a ground plane
    const whiteSquareTexture = new THREE.TextureLoader().load('/textures/whitesquare.png')
    whiteSquareTexture.wrapS = THREE.RepeatWrapping
    whiteSquareTexture.wrapT = THREE.RepeatWrapping
    whiteSquareTexture.repeat.set(500, 500)
    whiteSquareTexture.anisotropy = 16
    const groundGeo = new THREE.PlaneGeometry(500, 500)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: whiteSquareTexture,
      metalness: 0.5,
      roughness: 0.6,
    })
    const groundMesh = new THREE.Mesh(groundGeo, groundMat)
    groundMesh.rotation.x = -Math.PI / 2
    groundMesh.receiveShadow = true
    this.scene.add(groundMesh)

    // Add a tree
    const glbLoader = new GLTFLoader()
    glbLoader.load('/models/tree1.glb', (gltf) => {
      gltf.scene.traverse((c) => {
        c.castShadow = true
        c.receiveShadow = true
      })
      gltf.scene.scale.setScalar(0.25)

      const positions = [new THREE.Vector3(-15, 0, 0), new THREE.Vector3(-20, 0, 10)]

      for (let i = 0; i < positions.length; i++) {
        const tree = gltf.scene.clone()
        tree.position.copy(positions[i])
        this.scene.add(tree)
      }
    })

    glbLoader.load('/models/tree2.glb', (gltf) => {
      gltf.scene.traverse((c) => {
        c.castShadow = true
        c.receiveShadow = true
      })
      gltf.scene.scale.setScalar(0.25)

      const positions = [new THREE.Vector3(-15, 0, 12), new THREE.Vector3(20, 0, 15)]

      for (let i = 0; i < positions.length; i++) {
        const tree = gltf.scene.clone()
        tree.position.copy(positions[i])
        this.scene.add(tree)
      }
    })

    glbLoader.load('/models/campfire-logs.glb', (gltf) => {
      gltf.scene.traverse((c) => {
        c.castShadow = true
        c.receiveShadow = true
      })

      this.scene.add(gltf.scene)
    })

    // Create a flickering light
    this.campfireLight = new THREE.PointLight(0xf8b867, 100)
    this.campfireLight.position.set(0, 4, 0)
    this.campfireLight.castShadow = true
    this.campfireLight.shadow.mapSize.set(1024, 1024)
    this.scene.add(this.campfireLight)

    const helper = new THREE.PointLightHelper(this.campfireLight)
    this.scene.add(helper)

    this.createParticleSystem()
  }

  createParticleSystem() {
    const textureLoader = new THREE.TextureLoader()
    const fireTexture = textureLoader.load('/textures/fire.png')
    const smokeTexture = textureLoader.load('/textures/smoke.png')

    this.particleSystem = new ParticleSystem()

    // Fire
    {
      const sizeOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 3 },
        { time: 0.25, value: 10 },
        { time: 2, value: 0 },
      ])

      const twinkleOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 1, value: 0 },
      ])

      const alphaOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 0.25, value: 1 },
        { time: 2, value: 0 },
      ])

      const colorOverLife = new MATH.ColorInterpolant([
        { time: 0, value: new THREE.Color(0xffffc0) },
        { time: 1, value: new THREE.Color(0xff0000) },
      ])

      const fireMaterial = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_map: { value: fireTexture },
          u_size_over_life: { value: sizeOverLife.toTexture() },
          u_color_over_life: { value: colorOverLife.toTexture(alphaOverLife) },
          u_twinkle_over_life: { value: twinkleOverLife.toTexture() },
          u_spin_speed: { value: 0 },
          u_light_factor: { value: 0 },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        // blending: THREE.AdditiveBlending,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      })

      const fireAttractor = new ParticleAttractor()
      fireAttractor.position.set(0, 6, 0)
      fireAttractor.intensity = 4
      fireAttractor.radius = 3

      const fireEmitterParams = new EmitterParams()
      fireEmitterParams.shape = new PointShape()
      fireEmitterParams.shape.positionRadiusVariance = 1
      fireEmitterParams.maxLife = 2
      fireEmitterParams.maxParticles = 200
      fireEmitterParams.emissionRate = 50
      fireEmitterParams.maxEmission = Number.MAX_SAFE_INTEGER
      fireEmitterParams.velocityMagnitude = 4
      fireEmitterParams.rotationAngularVariance = Math.PI / 6
      fireEmitterParams.gravity = false
      fireEmitterParams.spinSpeed = Math.PI / 2
      fireEmitterParams.attractors.push(fireAttractor)

      const fireRendererParams = new ParticleRendererParams()
      fireRendererParams.maxParticles = fireEmitterParams.maxParticles

      fireEmitterParams.renderer = new ParticleRenderer()
      fireEmitterParams.renderer.initialize(fireMaterial, fireRendererParams)

      const fireEmitter = new Emitter(fireEmitterParams)

      this.particleSystem.addEmitter(fireEmitter)

      this.scene.add(fireRendererParams.group)
    }

    // Smoke
    {
      const sizeOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 8 },
        { time: 6, value: 24 },
      ])

      const twinkleOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 1, value: 0 },
      ])

      const alphaOverLife = new MATH.FloatInterpolant([
        { time: 0, value: 0 },
        { time: 0.5, value: 0.85 },
        { time: 6, value: 0 },
      ])

      const colorOverLife = new MATH.ColorInterpolant([
        { time: 0, value: new THREE.Color(0xc0c0c0) },
        { time: 6, value: new THREE.Color(0x404040) },
      ])

      const smokeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_map: { value: smokeTexture },
          u_size_over_life: { value: sizeOverLife.toTexture() },
          u_color_over_life: { value: colorOverLife.toTexture(alphaOverLife) },
          u_twinkle_over_life: { value: twinkleOverLife.toTexture() },
          u_spin_speed: { value: 0 },
          u_light_factor: { value: 1.0 },
          u_light_intensity: { value: 4.0 },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        // blending: THREE.NormalBlending,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      })

      this.smokeMaterial = smokeMaterial

      const smokeEmitterParams = new EmitterParams()
      smokeEmitterParams.shape = new PointShape()
      smokeEmitterParams.shape.position.set(0, 8, 0)
      smokeEmitterParams.shape.positionRadiusVariance = 1
      smokeEmitterParams.maxLife = 6
      smokeEmitterParams.maxParticles = 500
      smokeEmitterParams.emissionRate = 40
      smokeEmitterParams.maxEmission = Number.MAX_SAFE_INTEGER
      smokeEmitterParams.velocityMagnitude = 4
      smokeEmitterParams.rotationAngularVariance = Math.PI / 8
      smokeEmitterParams.gravity = false
      smokeEmitterParams.spinSpeed = Math.PI / 8
      smokeEmitterParams.dragCoefficient = 0.25

      const smokeRendererParams = new ParticleRendererParams()
      smokeRendererParams.maxParticles = smokeEmitterParams.maxParticles

      smokeEmitterParams.renderer = new ParticleRenderer()
      smokeEmitterParams.renderer.initialize(smokeMaterial, smokeRendererParams)

      const fireEmitter = new Emitter(smokeEmitterParams)

      this.particleSystem.addEmitter(fireEmitter)

      this.scene.add(smokeRendererParams.group)
    }
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

  scene = new ParticlesBlendingModesScene()
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
