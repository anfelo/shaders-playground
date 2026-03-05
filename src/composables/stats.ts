import { onUnmounted } from 'vue'
import Stats from 'stats.js'

let stats: Stats | null = null
let refCount = 0

type StatsOptions = {
  panel?: number
  autoShow?: boolean
}

export function useStats(options: StatsOptions = {}) {
  const { panel = 0, autoShow = true } = options

  // Initialize only once
  if (!stats) {
    stats = new Stats()
    stats.dom.style.position = 'absolute'
    stats.dom.style.left = 'unset'
    stats.dom.style.right = '300px'
    stats.dom.style.top = '0px'
    stats.showPanel(panel)

    if (autoShow) {
      document.body.appendChild(stats.dom)
    }
  }

  refCount++

  onUnmounted(() => {
    refCount--
    if (refCount === 0 && stats) {
      stats.dom.remove()
      stats = null
    }
  })

  function begin() {
    stats?.begin()
  }

  function end() {
    stats?.end()
  }

  function show() {
    if (stats && !stats.dom.parentElement) {
      document.body.appendChild(stats.dom)
    }
  }

  function hide() {
    stats?.dom.remove()
  }

  function setPanel(id: number) {
    stats?.showPanel(id)
  }

  return { stats, begin, end, show, hide, setPanel }
}
