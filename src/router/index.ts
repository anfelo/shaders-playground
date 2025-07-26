import { createRouter, createWebHistory } from 'vue-router'
import LinearPlotView from '@/views/LinearPlotView.vue'
import BasicColorView from '@/views/BasicColorView.vue'
import ExponentialPlotView from '@/views/ExponentialPlotView.vue'
import SmoothStepPlotView from '@/views/SmoothStepPlotView.vue'

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
    {
      path: '/exponential-plot',
      name: 'exponential-plot',
      component: ExponentialPlotView,
    },
    {
      path: '/smooth-step-plot',
      name: 'smooth-step-plot',
      component: SmoothStepPlotView,
    },
  ],
})

export default router
