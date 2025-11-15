import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import SwapPage from './pages/SwapPage.vue'
import PoolPage from './pages/PoolPage.vue'
import './index.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: SwapPage },
    { path: '/pool', component: PoolPage }
  ]
})

createApp(App)
  .use(router)
  .mount('#app')