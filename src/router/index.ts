import { createRouter, createWebHistory } from 'vue-router'
import LinearPlotView from '@/views/LinearPlotView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/linear-plot',
      name: 'linear-plot',
      component: LinearPlotView,
    },
  ],
})

export default router
