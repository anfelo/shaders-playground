<script setup lang="ts">
import Button from 'primevue/button'
import SidebarMenu from '@/components/SidebarMenu.vue'
import { useAppStore } from '@/store/store'

const appStore = useAppStore()
</script>

<template>
  <div class="layout">
    <div class="sidebar-toggle" :class="{ 'is-open': appStore.isMenuOpen }">
      <Button
        icon="pi pi-bars"
        severity="secondary"
        size="small"
        aria-label="Bars"
        @click="appStore.toggleMenu()"
      />
    </div>
    <div class="sidebar" :class="{ 'is-open': appStore.isMenuOpen }">
      <SidebarMenu />
    </div>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  position: relative;
  display: flex;
}

.sidebar-toggle {
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 99;
}

.sidebar-toggle.is-open {
  left: 194px;
}

.sidebar {
  padding: 0;
  background-color: #18181b;
  width: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar.is-open {
  padding: 4px;
  width: 250px;
}
</style>
