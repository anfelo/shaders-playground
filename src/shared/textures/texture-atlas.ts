import * as THREE from 'three'

// Taken from https://github.com/mrdoob/three.js/issues/758
function getImageData(image: CanvasImageSource & { width: number; height: number }): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height

  const context = canvas.getContext('2d')
  context!.translate(0, image.height)
  context!.scale(1, -1)
  context!.drawImage(image, 0, 0)

  return context!.getImageData(0, 0, image.width, image.height)
}

type ImageDataLoader = () => ImageData

export class TextureAtlas {
  private manager = new THREE.LoadingManager()
  private loader = new THREE.TextureLoader(this.manager)
  private textures: {
    [key: string]: { textures: ImageDataLoader[]; atlas?: THREE.DataArrayTexture }
  } = {}

  constructor() {
    this.create()
    this.onLoad = () => {}
  }

  onLoad() {}

  load(atlas: string, names: string[]) {
    this.loadAtlas(atlas, names)
  }

  create() {
    this.manager.onLoad = () => {
      this.onLoad_()
    }
  }

  get info() {
    return this.textures
  }

  onLoad_() {
    for (const k in this.textures) {
      let X = undefined
      let Y = undefined
      const atlas = this.textures[k]
      let data = null

      for (let t = 0; t < atlas.textures.length; t++) {
        const loader = atlas.textures[t]
        const curData = loader()

        const h = curData.height
        const w = curData.width

        if (X === undefined) {
          X = w
          Y = h
          data = new Uint8Array(atlas.textures.length * 4 * X * Y)
        }

        if (w !== X || h !== Y) {
          console.error('Texture dimensions do not match')
          return
        }
        const offset = t * (4 * w * h)

        if (!data) {
          console.error('ArrayBuffer not initialized')
          return
        }

        data.set(curData.data, offset)
      }

      const diffuse = new THREE.DataArrayTexture(data, X, Y, atlas.textures.length)
      diffuse.format = THREE.RGBAFormat
      diffuse.type = THREE.UnsignedByteType
      diffuse.minFilter = THREE.LinearMipMapLinearFilter
      diffuse.magFilter = THREE.LinearFilter
      diffuse.wrapS = THREE.ClampToEdgeWrapping
      diffuse.wrapT = THREE.ClampToEdgeWrapping
      // diffuse.wrapS = THREE.RepeatWrapping;
      // diffuse.wrapT = THREE.RepeatWrapping;
      diffuse.generateMipmaps = true
      diffuse.needsUpdate = true

      atlas.atlas = diffuse
    }

    this.onLoad()
  }

  private loadType(t: string) {
    if (typeof t == 'string') {
      const texture = this.loader.load(t)
      return () => {
        return getImageData(texture.image)
      }
    } else {
      return () => {
        return t
      }
    }
  }

  private loadAtlas(atlas: string, names: string[]) {
    this.textures[atlas] = {
      textures: names.map((n) => this.loadType(n)),
    }
  }
}
