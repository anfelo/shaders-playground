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
      {
        label: 'Color Mix',
        url: '/color-mix',
      },
      {
        label: 'Multi Color Mix',
        url: '/multi-color-mix',
      },
      {
        label: 'Color Transition',
        url: '/color-transition',
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
      {
        label: 'Smooth Step Plot',
        url: '/smooth-step-plot',
      },
      {
        label: 'Sine Plot',
        url: '/sine-plot',
      },
      {
        label: 'Rectangle Shape',
        url: '/rectangle-shape',
      },
      {
        label: 'Grid',
        url: '/grid',
      },
      {
        label: 'Circle Shape',
        url: '/circle-shape',
      },
      {
        label: 'Triangle Shape',
        url: '/triangle-shape',
      },
      {
        label: 'Polar Shapes',
        url: '/polar-shapes',
      },
    ],
  },
]
</script>

<template>
  <Menu :model="items" />
</template>

<style scoped></style>
