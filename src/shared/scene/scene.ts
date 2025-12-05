import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { GUI } from 'lil-gui'
import { useAppStore } from '@/store/store'

export class Scene {
  mouse = new THREE.Vector2(0.0, 0.0)

  scene = new THREE.Scene()
  renderer = new THREE.WebGLRenderer()
  gui = new GUI()

  uniforms: { [uniform: string]: THREE.IUniform<unknown> } = {}

  width: number = window.innerWidth
  height: number = window.innerHeight

  appStore = useAppStore()
  unsubscribe: () => void = () => {}

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

    this.unsubscribe()
  }

  async init(): Promise<void> {
    this.setSceneSize()

    this.renderer.setSize(this.width, this.height)

    window.addEventListener(
      'resize',
      () => {
        this.setSceneSize()
        this.onWindowResize()
      },
      false,
    )
    document.addEventListener('mousemove', (event) => this.onMouseDown(event), false)

    this.unsubscribe = this.appStore.$subscribe(() => {
      this.setSceneSize()
      this.onWindowResize()
    })

    this.onWindowResize()
  }

  loadRGBE(path: string) {
    const rgbeLoader = new RGBELoader()
    rgbeLoader.load(path, (hdrTexture) => {
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping

      this.scene.background = hdrTexture
      this.scene.environment = hdrTexture
    })
  }

  private setSceneSize() {
    const isMenuOpen = this.appStore.isMenuOpen

    const xOffset = isMenuOpen ? 250 : 0

    this.width = window.innerWidth - xOffset
    this.height = window.innerHeight
  }

  private onWindowResize() {
    this.renderer.setSize(this.width, this.height)

    if (this.uniforms.u_resolution) {
      this.uniforms.u_resolution.value = [this.width, this.height]
    }

    this.onResize()
  }

  onResize() {}

  private onMouseDown(event: MouseEvent) {
    this.mouse.x = event.clientX
    this.mouse.y = event.clientY
  }
}
