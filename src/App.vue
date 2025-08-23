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
  position: fixed;
  top: 0;
  left: 0;
  width: 250px;
  padding: 10px;
}
</style>
