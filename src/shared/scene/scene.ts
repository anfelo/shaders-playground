import * as THREE from 'three'
import { GUI } from 'lil-gui'

export class Scene {
  mouse = new THREE.Vector2(0.0, 0.0)

  renderer = new THREE.WebGLRenderer()
  gui = new GUI()

  uniforms: { [uniform: string]: THREE.IUniform<unknown> } = {}

  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    // Dispose renderer
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()

    this.gui.destroy()

    // Remove event listeners
    window.removeEventListener('resize', this.onWindowResize)
    document.removeEventListener('mousemove', this.onMouseDown, false)
  }

  async init(): Promise<void> {
    this.renderer.setSize(this.width, this.height)

    window.addEventListener('resize', () => this.onWindowResize(), false)
    document.addEventListener('mousemove', (event) => this.onMouseDown(event), false)

    this.onWindowResize()
  }

  private onWindowResize() {
    this.width = window.innerWidth - 250
    this.height = window.innerHeight

    this.renderer.setSize(this.width, this.height)

    if (this.uniforms.u_resolution) {
      this.uniforms.u_resolution.value = [this.width, this.height]
    }
  }

  private onMouseDown(event: MouseEvent) {
    this.mouse.x = event.clientX
    this.mouse.y = event.clientY
  }
}
