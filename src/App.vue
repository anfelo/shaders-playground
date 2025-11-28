<script setup lang="ts">
import SidebarMenu from '@/components/SidebarMenu.vue'
</script>

<template>
  <div class="layout">
    <div class="sidebar">
      <SidebarMenu />
    </div>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
}
.sidebar {
  padding: 4px;
  background-color: #18181B;
  width: 250px;
  height: 100vh;
  overflow-y: auto;
}
</style>
