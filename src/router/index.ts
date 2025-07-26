import { createRouter, createWebHistory } from 'vue-router'
import LinearPlotView from '@/views/LinearPlotView.vue'
import BasicColorView from '@/views/BasicColorView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/color',
      name: 'color',
      component: BasicColorView,
    },
    {
      path: '/linear-plot',
      name: 'linear-plot',
      component: LinearPlotView,
    },
  ],
})

export default router
