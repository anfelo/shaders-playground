import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config'
import Noir from '@/themes/noir'

const app = createApp(App)

app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Noir,
    options: {
      darkModeSelector: true,
    },
  },
})

app.mount('#app')
