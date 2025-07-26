<script setup lang="ts">
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'

const items: MenuItem[] = [
  {
    label: 'Basics',
    items: [
      {
        label: 'Color',
        url: '/color',
      },
    ],
  },
  {
    label: 'Shaping Functions',
    items: [
      {
        label: 'Linear Plot',
        url: '/linear-plot',
      },
      {
        label: 'Exponential Plot',
        url: '/exponential-plot',
      },
    ],
  },
]
</script>

<template>
  <Menu :model="items" />
</template>

<style scoped></style>
