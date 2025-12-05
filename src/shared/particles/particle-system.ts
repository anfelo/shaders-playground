import * as THREE from 'three'
import * as MATH from '@/shared/math/math'

const GRAVITY = new THREE.Vector3(0, -9.8, 0)
const DRAG = 0.5

// Manages emitters
export class ParticleSystem {
  private emitters: Emitter[] = []

  get stillActive(): boolean {
    for (let i = 0; i < this.emitters.length; ++i) {
      if (this.emitters[i].stillActive) {
        return true
      }
    }

    return false
  }

  dispose() {
    for (let i = 0; i < this.emitters.length; ++i) {
      this.emitters[i].dispose()
    }
  }

  addEmitter(emitter: Emitter) {
    this.emitters.push(emitter)
  }

  step(timeElapsed: number, totalTimeElapsed: number) {
    for (let i = 0; i < this.emitters.length; ++i) {
      const emitter = this.emitters[i]

      emitter.step(timeElapsed, totalTimeElapsed)

      if (!emitter.stillActive) {
        emitter.dispose()
      }
    }

    this.emitters = this.emitters.filter((e) => e.stillActive)
  }
}

export class Particle {
  position = new THREE.Vector3()
  velocity = new THREE.Vector3()
  life = 0
  maxLife = 5
  id = MATH.random()

  attachedEmitter: Emitter | null = null
  attachedShape: EmitterShape | null = null
}

export class ParticleRendererParams {
  maxParticles = 100
  group = new THREE.Group()
}

// Draws particles
export class ParticleRenderer {
  private particleGeometry: THREE.BufferGeometry | null = new THREE.BufferGeometry()
  private particlePoints: THREE.Points | null = null
  private material: THREE.ShaderMaterial | null = null

  dispose() {
    this.particlePoints?.removeFromParent()
    this.particleGeometry?.dispose()
    this.material?.dispose()

    this.particlePoints = null
    this.particleGeometry = null
    this.material = null
  }

  initialize(material: THREE.ShaderMaterial, params: ParticleRendererParams) {
    this.particleGeometry = new THREE.BufferGeometry()

    const positions = new Float32Array(params.maxParticles * 3)
    const particleData = new Float32Array(params.maxParticles * 2)

    this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.particleGeometry.setAttribute(
      'particle_data',
      new THREE.Float32BufferAttribute(particleData, 2),
    )

    // Set dynamic draw usage on every attribute we plan on updating
    const positionAttr = this.particleGeometry.attributes.position as THREE.BufferAttribute
    const particleDataAttr = this.particleGeometry.attributes.particle_data as THREE.BufferAttribute

    positionAttr.setUsage(THREE.DynamicDrawUsage)
    particleDataAttr.setUsage(THREE.DynamicDrawUsage)

    this.particlePoints = new THREE.Points(this.particleGeometry, material)

    this.material = material

    params.group.add(this.particlePoints)
  }

  updateFromParticles(particles: Particle[], params: EmitterParams, totalTimeElapsed: number) {
    if (!this.particleGeometry) {
      return
    }

    this.material!.uniforms.u_time.value = totalTimeElapsed
    this.material!.uniforms.u_spin_speed.value = params.spinSpeed

    const positions = new Float32Array(particles.length * 3)
    const particleData = new Float32Array(particles.length * 2)

    for (let i = 0; i < particles.length; ++i) {
      const p = particles[i]
      positions[i * 3 + 0] = p.position.x
      positions[i * 3 + 1] = p.position.y
      positions[i * 3 + 2] = p.position.z
      particleData[i * 2 + 0] = p.life / p.maxLife
      particleData[i * 2 + 1] = p.id
    }

    // Set dynamic draw usage on every attribute we plan on updating
    const positionAttr = this.particleGeometry.attributes.position as THREE.BufferAttribute
    positionAttr.copyArray(positions)
    const particleDataAttr = this.particleGeometry.attributes.particle_data as THREE.BufferAttribute
    particleDataAttr.copyArray(particleData)

    this.particleGeometry.attributes.position.needsUpdate = true
    this.particleGeometry.attributes.particle_data.needsUpdate = true

    this.particleGeometry.setDrawRange(0, particles.length)
  }
}

export class EmitterParams {
  maxLife = 5
  velocityMagnitude = 0
  velocityMagnitudeVariance = 0
  rotation = new THREE.Quaternion()
  rotationAngularVariance = 0
  spinSpeed = 0

  maxParticles = 100
  maxEmission = 100
  emissionRate = 1
  gravity = false
  gravityStrength = 1
  dragCoefficient = DRAG
  renderer: ParticleRenderer | null = null
  shape = new PointShape()

  onCreate: ((particle: Particle) => void) | null = null
  onStep: ((particle: Particle) => void) | null = null
  onDestroy: ((particle: Particle) => void) | null = null
}

// Manages particles
export class Emitter {
  private particles: Particle[] = []
  private emissionTime = 0
  private numParticlesEmitted = 0
  private params: EmitterParams

  dead = false

  constructor(params: EmitterParams) {
    this.params = params
  }

  get stillActive(): boolean {
    if (this.dead) {
      return false
    }

    return this.numParticlesEmitted < this.params.maxEmission || this.particles.length > 0
  }

  dispose() {
    if (this.params.onDestroy) {
      for (let i = 0; i < this.particles.length; ++i) {
        this.params.onDestroy(this.particles[i])
      }
    }
    this.particles = []

    if (this.params.renderer) {
      this.params.renderer.dispose()
    }
  }

  step(timeElapsed: number, totalTimeElapsed: number) {
    this.updateEmission(timeElapsed)
    this.updateParticles(timeElapsed)

    if (this.params.renderer) {
      this.params.renderer.updateFromParticles(this.particles, this.params, totalTimeElapsed)
      return
    }
  }

  stop() {
    this.params.maxEmission = 0
  }

  kill() {
    this.dead = true
  }

  private canCreateParticle(): boolean {
    if (this.dead) {
      return false
    }

    const secondsPerParticle = 1 / this.params.emissionRate

    return (
      this.emissionTime >= secondsPerParticle &&
      this.particles.length < this.params.maxParticles &&
      this.numParticlesEmitted < this.params.maxEmission
    )
  }

  private emitParticle(): Particle {
    const p = this.params.shape.emit()

    p.maxLife = this.params.maxLife

    const phi = MATH.random() * Math.PI * 2
    const theta = MATH.random() * this.params.rotationAngularVariance

    p.velocity = new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi),
    )

    const velocity =
      this.params.velocityMagnitude +
      (MATH.random() * 2 - 1) * this.params.velocityMagnitudeVariance

    p.velocity.multiplyScalar(velocity)
    p.velocity.applyQuaternion(this.params.rotation)

    if (this.params.onCreate) {
      this.params.onCreate(p)
    }

    return p
  }

  private updateEmission(timeElapsed: number) {
    if (this.dead) {
      return
    }

    this.emissionTime += timeElapsed
    const secondsPerParticle = 1 / this.params.emissionRate

    while (this.canCreateParticle()) {
      this.emissionTime -= secondsPerParticle
      this.numParticlesEmitted++

      const particle = this.emitParticle()

      this.particles.push(particle)
    }
  }

  private updateParticle(particle: Particle, timeElapsed: number) {
    particle.life += timeElapsed
    particle.life = Math.min(particle.life, particle.maxLife)

    // Update position based on velocity and gravity
    const forces = this.params.gravity ? GRAVITY.clone() : new THREE.Vector3()
    forces.multiplyScalar(this.params.gravityStrength)
    forces.add(particle.velocity.clone().multiplyScalar(-this.params.dragCoefficient))

    particle.velocity.add(forces.multiplyScalar(timeElapsed))

    const displacement = particle.velocity.clone().multiplyScalar(timeElapsed)
    particle.position.add(displacement)

    if (this.params.onStep) {
      this.params.onStep(particle)
    }

    if (particle.life >= particle.maxLife) {
      if (this.params.onDestroy) {
        this.params.onDestroy(particle)
      }
    }
  }

  private updateParticles(timeElapsed: number) {
    for (let i = 0; i < this.particles.length; ++i) {
      const p = this.particles[i]
      this.updateParticle(p, timeElapsed)
    }

    this.particles = this.particles.filter((p) => p.life < p.maxLife)
  }
}

// Defines the volume where particles are created
export class EmitterShape {
  position = new THREE.Vector3()

  emit(): Particle {
    return new Particle()
  }
}

export class PointShape extends EmitterShape {
  position = new THREE.Vector3()
  positionRadiusVariance = 0

  emit(): Particle {
    const p = new Particle()
    p.position.copy(this.position)

    const phi = MATH.random() * Math.PI * 2
    const theta = MATH.random() * Math.PI
    const radius = MATH.random() * this.positionRadiusVariance

    const dir = new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi),
    )
    dir.multiplyScalar(radius)
    p.position.add(dir)

    return p
  }
}
