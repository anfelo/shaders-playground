<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'
import Menu from 'primevue/menu'

const items: MenuItem[] = [
  {
    label: 'Basics',
    items: [
      {
        label: 'Color',
        route: '/color',
      },
      {
        label: 'Color Mix',
        route: '/color-mix',
      },
      {
        label: 'Multi Color Mix',
        route: '/multi-color-mix',
      },
      {
        label: 'Color Transition',
        route: '/color-transition',
      },
    ],
  },
  {
    label: 'Shaping Functions',
    items: [
      {
        label: 'Linear Plot',
        route: '/linear-plot',
      },
      {
        label: 'Exponential Plot',
        route: '/exponential-plot',
      },
      {
        label: 'Smooth Step Plot',
        route: '/smooth-step-plot',
      },
      {
        label: 'Sine Plot',
        route: '/sine-plot',
      },
    ],
  },
  {
    label: 'Shapes',
    items: [
      {
        label: 'Rectangle Shape',
        route: '/rectangle-shape',
      },
      {
        label: 'Grid',
        route: '/grid',
      },
      {
        label: 'Circle Shape',
        route: '/circle-shape',
      },
      {
        label: 'Triangle Shape',
        route: '/triangle-shape',
      },
      {
        label: 'Polar Shapes',
        route: '/polar-shapes',
      },
    ],
  },
  {
    label: 'Transforms',
    items: [
      {
        label: 'Translate',
        route: '/translate',
      },
      {
        label: 'Rotate',
        route: '/rotate',
      },
      {
        label: 'Scale',
        route: '/scale',
      },
    ],
  },
  {
    label: 'Patterns',
    items: [
      {
        label: 'Circles',
        route: '/circles',
      },
      {
        label: 'Dancing Tiles',
        route: '/dancing-tiles',
      },
    ],
  },
  {
    label: 'SDFs & Simple Shapes',
    items: [
      {
        label: 'Simple Shapes',
        route: '/simple-shapes',
      },
      {
        label: 'Boolean Operations',
        route: '/boolean-operations',
      },
      {
        label: 'Cloudy Day',
        route: '/cloudy-day',
      },
    ],
  },
  {
    label: 'Random',
    items: [
      {
        label: 'Noise',
        route: '/noise',
      },
      {
        label: 'Mosaic',
        route: '/mosaic',
      },
      {
        label: 'Bilinear Filtering',
        route: '/bilinear-filtering',
      },
      {
        label: 'Perlin & Simplex',
        route: '/perlin-and-simplex',
      },
      {
        label: 'Turbulent Water',
        route: '/turbulent-water',
      },
      {
        label: 'Landscape',
        route: '/landscape',
      },
    ],
  },
  {
    label: 'Post FX',
    items: [
      {
        label: 'Color Manipulation',
        route: '/color-manipulation',
      },
      {
        label: 'Distorsion & Ripples',
        route: '/distorsion-ripples',
      },
      {
        label: 'Planet & Stars',
        route: '/planet-stars',
      },
    ],
  },
  {
    label: 'RayMarching',
    items: [
      {
        label: 'Sphere Tracing',
        route: '/sphere-tracing',
      },
      {
        label: 'Terrain',
        route: '/terrain',
      },
    ],
  },
  {
    label: 'Grass',
    items: [
      {
        label: 'Single Blade Instance',
        route: '/single-blade',
      },
    ],
  },
]
</script>

<template>
  <Menu :model="items">
    <template #item="{ item, props }">
      <router-link v-if="item.route" v-slot="{ href, navigate }" :to="item.route" custom>
        <a v-ripple :href="href" v-bind="props.action" @click="navigate">
          <span :class="item.icon" />
          <span class="ml-2">{{ item.label }}</span>
        </a>
      </router-link>
      <a v-else v-ripple :href="item.url" :target="item.target" v-bind="props.action">
        <span :class="item.icon" />
        <span class="ml-2">{{ item.label }}</span>
      </a>
    </template>
  </Menu>
</template>

<style scoped></style>
