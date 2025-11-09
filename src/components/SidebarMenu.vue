<script setup lang="ts">
import PanelMenu from 'primevue/panelmenu'
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
    ],
  },
  {
    label: 'Shapes',
    items: [
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
  {
    label: 'Transforms',
    items: [
      {
        label: 'Translate',
        url: '/translate',
      },
      {
        label: 'Rotate',
        url: '/rotate',
      },
      {
        label: 'Scale',
        url: '/scale',
      },
    ],
  },
  {
    label: 'Patterns',
    items: [
      {
        label: 'Circles',
        url: '/circles',
      },
      {
        label: 'Dancing Tiles',
        url: '/dancing-tiles',
      },
    ],
  },
  {
    label: 'SDFs & Simple Shapes',
    items: [
      {
        label: 'Simple Shapes',
        url: '/simple-shapes',
      },
      {
        label: 'Boolean Operations',
        url: '/boolean-operations',
      },
    ],
  },
  {
    label: 'Random',
    items: [
      {
        label: 'Noice',
        url: '/noice',
      },
      {
        label: 'Mosaic',
        url: '/mosaic',
      },
    ],
  },
]
</script>

<template>
  <PanelMenu :model="items" />
</template>

<style scoped></style>
