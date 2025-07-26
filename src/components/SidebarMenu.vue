<script setup lang="ts">
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'

const items: MenuItem[] = [
  {
    label: 'Shaping Functions',
    items: [
      {
        label: 'Linear Plot',
        url: '/linear-plot',
      },
    ],
  },
]
</script>

<template>
  <Menu :model="items" />
</template>

<style scoped></style>
