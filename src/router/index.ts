import { createRouter, createWebHistory } from 'vue-router'
import LinearPlotView from '@/views/LinearPlotView.vue'
import BasicColorView from '@/views/BasicColorView.vue'
import ExponentialPlotView from '@/views/ExponentialPlotView.vue'
import SmoothStepPlotView from '@/views/SmoothStepPlotView.vue'
import SinePlotView from '@/views/SinePlotView.vue'
import ColorMixView from '@/views/ColorMixView.vue'
import MultiColorMixView from '@/views/MultiColorMixView.vue'
import ColorTransitionView from '@/views/ColorTransitionView.vue'
import RectangleShapeView from '@/views/RectangleShapeView.vue'
import CircleShapeView from '@/views/CircleShapeView.vue'
import PolarShapesView from '@/views/PolarShapesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/color',
      name: 'color',
      component: BasicColorView,
    },
    {
      path: '/color-mix',
      name: 'color-mix',
      component: ColorMixView,
    },
    {
      path: '/multi-color-mix',
      name: 'multi-color-mix',
      component: MultiColorMixView,
    },
    {
      path: '/color-transition',
      name: 'color-transition',
      component: ColorTransitionView,
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
    {
      path: '/sine-plot',
      name: 'sine-plot',
      component: SinePlotView,
    },
    {
      path: '/rectangle-shape',
      name: 'rectangle-shape',
      component: RectangleShapeView,
    },
    {
      path: '/circle-shape',
      name: 'circle-shape',
      component: CircleShapeView,
    },
    {
      path: '/polar-shapes',
      name: 'polar-shapes',
      component: PolarShapesView,
    },
  ],
})

export default router
