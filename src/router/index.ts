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
import TriangleShapeView from '@/views/TriangleShapeView.vue'
import GridView from '@/views/GridView.vue'
import TranslateView from '@/views/TranslateView.vue'
import RotateView from '@/views/RotateView.vue'
import ScaleView from '@/views/ScaleView.vue'
import CirclesView from '@/views/CirclesView.vue'
import DancingTilesView from '@/views/DancingTilesView.vue'
import NoiseView from '@/views/NoiseView.vue'
import MosaicView from '@/views/MosaicView.vue'
import SimpleShapesView from '@/views/SimpleShapesView.vue'
import BooleanOperationsView from '@/views/BooleanOperationsView.vue'
import CloudyDayView from '@/views/CloudyDayView.vue'
import BilinearFiltering from '@/views/BilinearFiltering.vue'
import PerlinAndSimplexView from '@/views/PerlinAndSimplexView.vue'
import TurbulentWaterView from '@/views/TurbulentWaterView.vue'
import LandscapeView from '@/views/LandscapeView.vue'
import ColorManipulationView from '@/views/ColorManipulationView.vue'
import DistorsionAndRipplesView from '@/views/DistorsionAndRipplesView.vue'
import PlanetAndStarsView from '@/views/PlanetAndStarsView.vue'
import SphereTracingView from '@/views/SphereTracingView.vue'
import TerrainView from '@/views/TerrainView.vue'
import SingleBladeGrassView from '@/views/SingleBladeGrassView.vue'
import BasicParticlesView from '@/views/BasicParticlesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/color',
    },
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
    {
      path: '/triangle-shape',
      name: 'triangle-shape',
      component: TriangleShapeView,
    },
    {
      path: '/grid',
      name: 'grid',
      component: GridView,
    },
    {
      path: '/translate',
      name: 'translate',
      component: TranslateView,
    },
    {
      path: '/rotate',
      name: 'rotate',
      component: RotateView,
    },
    {
      path: '/scale',
      name: 'scale',
      component: ScaleView,
    },
    {
      path: '/circles',
      name: 'circles',
      component: CirclesView,
    },
    {
      path: '/dancing-tiles',
      name: 'dancing-tiles',
      component: DancingTilesView,
    },
    {
      path: '/noise',
      name: 'noise',
      component: NoiseView,
    },
    {
      path: '/mosaic',
      name: 'mosaic',
      component: MosaicView,
    },
    {
      path: '/bilinear-filtering',
      name: 'bilinear-filtering',
      component: BilinearFiltering,
    },
    {
      path: '/perlin-and-simplex',
      name: 'perlin-and-simplex',
      component: PerlinAndSimplexView,
    },
    {
      path: '/turbulent-water',
      name: 'turbulent-water',
      component: TurbulentWaterView,
    },
    {
      path: '/landscape',
      name: 'landscape',
      component: LandscapeView,
    },
    {
      path: '/simple-shapes',
      name: 'simple-shapes',
      component: SimpleShapesView,
    },
    {
      path: '/boolean-operations',
      name: 'boolean-operations',
      component: BooleanOperationsView,
    },
    {
      path: '/cloudy-day',
      name: 'cloudy-day',
      component: CloudyDayView,
    },
    {
      path: '/color-manipulation',
      name: 'color-manipulation',
      component: ColorManipulationView,
    },
    {
      path: '/distorsion-ripples',
      name: 'distorsion-ripples',
      component: DistorsionAndRipplesView,
    },
    {
      path: '/planet-stars',
      name: 'planet-stars',
      component: PlanetAndStarsView,
    },
    {
      path: '/sphere-tracing',
      name: 'sphere-tracing',
      component: SphereTracingView,
    },
    {
      path: '/terrain',
      name: 'terrain',
      component: TerrainView,
    },
    {
      path: '/single-blade',
      name: 'single-blade',
      component: SingleBladeGrassView,
    },
    {
      path: '/basic-particles',
      name: 'basic-particles',
      component: BasicParticlesView,
    },
  ],
})

export default router
