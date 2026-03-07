import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { GUI } from 'lil-gui'
import { useAppStore } from '@/store/store'
import { TextureLoader } from 'three'

export class Scene {
  mouse = new THREE.Vector2(0.0, 0.0)

  scene = new THREE.Scene()
  renderer = new THREE.WebGLRenderer({ antialias: true })
  gui = new GUI()

  uniforms: { [uniform: string]: THREE.IUniform<unknown> } = {}

  width: number = window.innerWidth
  height: number = window.innerHeight

  private fontLoader: FontLoader | null = null
  private rgbeLoader: RGBELoader | null = null
  private gltfLoader: GLTFLoader | null = null
  private textureLoader: TextureLoader | null = null

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

    this.setLoaders()

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

  private setLoaders(): void {
    this.rgbeLoader = new RGBELoader()

    this.gltfLoader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/libs/draco')
    this.gltfLoader.setDRACOLoader(dracoLoader)

    this.fontLoader = new FontLoader()

    this.textureLoader = new TextureLoader()
  }

  loadRGBE(path: string) {
    this.rgbeLoader!.load(path, (hdrTexture) => {
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping

      this.scene.background = hdrTexture
      this.scene.environment = hdrTexture
    })
  }

  async loadGLTF(path: string) {
    return await this.gltfLoader!.loadAsync(path)
  }

  async loadFont(path: string) {
    return await this.fontLoader!.loadAsync(path)
  }

  async loadTexture(path: string) {
    return this.textureLoader!.loadAsync(path)
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
