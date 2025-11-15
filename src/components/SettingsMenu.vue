<template>
  <div
    :class="[
      'absolute right-0 mt-2 w-[120px] rounded-lg p-2 border',
      isNight ? 'bg-black border-[#0b401e]' : 'bg-white border-white'
    ]"
  >
    <div class="text-xs font-semibold mb-1">Theme</div>
    <ThemeSlider />
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/ThemeContext'
import ThemeSlider from './ThemeSlider.vue'

const { isNight } = useTheme()
</script>