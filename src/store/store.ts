import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useAppStore = defineStore('app', () => {
  const menuOpenString = localStorage.getItem('menuOpen') ?? 'true'
  const isMenuOpen = ref(menuOpenString === 'true' ? true : false)

  function toggleMenu() {
    isMenuOpen.value = !isMenuOpen.value
  }

  watch(isMenuOpen, (val) => {
    localStorage.setItem('menuOpen', val ? 'true' : 'false')
  })

  return { isMenuOpen, toggleMenu }
})
