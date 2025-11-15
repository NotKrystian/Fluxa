<template>
  <div
    :class="[
      'min-h-screen w-full',
      isNight ? 'text-[#b7f7c6] bg-black' : 'text-[#09320f] bg-white'
    ]"
  >
    <Header />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { useTheme } from './composables/ThemeContext'
import Header from './components/Header.vue'

const { isNight } = useTheme()
</script>