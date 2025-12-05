import * as THREE from 'three'
import MersenneTwister from 'mersennetwister'

const MT = new MersenneTwister(1)

function random() {
  return MT.random()
}

type InterpolantFrame = {
  time: number
  value: number[]
}

type Vec3InterpolantFrame = {
  time: number
  value: THREE.Vector3
}

type FloatInterpolantFrame = {
  time: number
  value: number
}

type ColorInterpolantFrame = {
  time: number
  value: THREE.Color
}

class Interpolant<T = Float32Array> {
  private _frames: InterpolantFrame[] = []
  private interpolator: THREE.LinearInterpolant
  private resultBuffer: Float32Array

  get frames() {
    return this._frames
  }

  constructor(frames: InterpolantFrame[], stride: number) {
    const times = []
    const values = []

    for (let i = 0; i < frames.length; ++i) {
      times.push(frames[i].time)
      values.push(...frames[i].value)
    }

    this.resultBuffer = new Float32Array(stride)

    this._frames = frames
    this.interpolator = new THREE.LinearInterpolant(times, values, stride, this.resultBuffer)
  }

  evaluate(time: number): T {
    this.interpolator.evaluate(time)

    return this.onEvaluate(this.resultBuffer)
  }

  onEvaluate(result: Float32Array): T {
    return result as T
  }
}

class Vec3Interpolant extends Interpolant<THREE.Vector3> {
  constructor(frames: Vec3InterpolantFrame[]) {
    const _frames: InterpolantFrame[] = []
    for (let i = 0; i < frames.length; ++i) {
      _frames[i] = {
        time: frames[i].time,
        value: [frames[i].value.x, frames[i].value.y, frames[i].value.z],
      }
    }
    super(_frames, 3)
  }

  onEvaluate(result: Float32Array): THREE.Vector3 {
    return new THREE.Vector3(result[0], result[1], result[2])
  }
}

class FloatInterpolant extends Interpolant<number> {
  constructor(frames: FloatInterpolantFrame[]) {
    const _frames: InterpolantFrame[] = []
    for (let i = 0; i < frames.length; ++i) {
      _frames[i] = {
        time: frames[i].time,
        value: [frames[i].value],
      }
    }
    super(_frames, 1)
  }

  onEvaluate(result: Float32Array): number {
    return result[0]
  }

  toTexture(): THREE.DataTexture {
    const frames = this.frames
    const maxFrameTime = frames[frames.length - 1].time

    let smallestStep = 0.5
    for (let i = 1; i < frames.length; ++i) {
      const stepSize = (frames[i].time - frames[i - 1].time) / maxFrameTime
      smallestStep = Math.min(smallestStep, stepSize)
    }

    // Compute recommended size
    const recommendedSize = Math.ceil(1 / smallestStep)

    // Make 1D texture with the values
    const width = recommendedSize + 1
    const data = new Float32Array(width)

    for (let i = 0; i < width; ++i) {
      const t = i / (width - 1)
      const value = this.evaluate(t * maxFrameTime)
      data[i] = value
    }

    const dt = new THREE.DataTexture(data, width, 1, THREE.RedFormat, THREE.FloatType)
    dt.minFilter = THREE.LinearFilter
    dt.magFilter = THREE.LinearFilter
    dt.wrapS = THREE.ClampToEdgeWrapping
    dt.wrapT = THREE.ClampToEdgeWrapping
    dt.needsUpdate = true

    return dt
  }
}

class ColorInterpolant extends Interpolant<THREE.Color> {
  constructor(frames: ColorInterpolantFrame[]) {
    const _frames: InterpolantFrame[] = []
    for (let i = 0; i < frames.length; ++i) {
      _frames[i] = {
        time: frames[i].time,
        value: [frames[i].value.r, frames[i].value.g, frames[i].value.b],
      }
    }
    super(_frames, 3)
  }

  onEvaluate(result: Float32Array): THREE.Color {
    return new THREE.Color(result[0], result[1], result[2])
  }

  toTexture(alphaInterpolant: FloatInterpolant): THREE.DataTexture {
    const frames = this.frames
    const alphaFrames = alphaInterpolant.frames

    const maxFrameTime = Math.max(
      frames[frames.length - 1].time,
      alphaFrames[alphaFrames.length - 1].time,
    )

    let smallestStep = 0.5
    for (let i = 1; i < frames.length; ++i) {
      const stepSize = (frames[i].time - frames[i - 1].time) / maxFrameTime
      smallestStep = Math.min(smallestStep, stepSize)
    }
    for (let i = 1; i < alphaFrames.length; ++i) {
      const stepSize = (alphaFrames[i].time - alphaFrames[i - 1].time) / maxFrameTime
      smallestStep = Math.min(smallestStep, stepSize)
    }

    // Compute recommended size
    const recommendedSize = Math.ceil(1 / smallestStep)

    // Make 1D texture with the values
    const width = recommendedSize + 1
    const data = new Float32Array(width * 4)

    for (let i = 0; i < width; ++i) {
      const t = i / (width - 1)
      const color = this.evaluate(t * maxFrameTime)
      const alpha = alphaInterpolant.evaluate(t * maxFrameTime)

      data[i * 4 + 0] = color.r
      data[i * 4 + 1] = color.g
      data[i * 4 + 2] = color.b
      data[i * 4 + 3] = alpha
    }

    const dt = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.FloatType)
    dt.minFilter = THREE.LinearFilter
    dt.magFilter = THREE.LinearFilter
    dt.wrapS = THREE.ClampToEdgeWrapping
    dt.wrapT = THREE.ClampToEdgeWrapping
    dt.needsUpdate = true

    return dt
  }
}

export { random, Vec3Interpolant, FloatInterpolant, ColorInterpolant }
