<template>
  <div
    :class="[
      'relative w-full h-[36px] rounded-full px-[18px] cursor-pointer flex items-center justify-between',
      isNight ? 'bg-[#0b401e]' : 'bg-[#0b3a1a]'
    ]"
    role="switch"
    :aria-checked="isNight"
    @click="setTheme(isNight ? 'light' : 'night')"
  >
    <span class="text-[12px] leading-none z-0">🌙</span>
    <span class="text-[12px] leading-none z-0">☀️</span>
    <div
      :class="[
        'absolute inset-y-0 my-auto h-[18px] w-[18px] rounded-full transition-all duration-200 z-10',
        isNight ? 'left-[15px] bg-white' : 'right-[15px] bg-yellow-400'
      ]"
    />
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/ThemeContext'

const { isNight, setTheme } = useTheme()
</script>