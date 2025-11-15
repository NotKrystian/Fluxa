<template>
  <header class="flex items-center justify-between px-6 py-4">
    <div class="flex items-center gap-3">
      <div
        :class="[
          'w-10 h-10 rounded-lg flex items-center justify-center',
          isNight ? 'bg-[#0b401e]' : 'bg-[#0b3a1a]'
        ]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          class="w-7 h-7"
        >
          <circle cx="32" cy="32" r="28" fill="#FFD700" />
          <path
            d="M32 16v32M16 32h32"
            stroke="white"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <div class="text-xl font-bold">Fluxa</div>

      <router-link
        to="/"
        :class="[
          'ml-4 opacity-80',
          route.path === '/' ? 'font-bold underline' : ''
        ]"
      >
        Trade
      </router-link>
      <router-link
        to="/pool"
        :class="[
          'ml-2 opacity-80',
          route.path === '/pool' ? 'font-bold underline' : ''
        ]"
      >
        Pool
      </router-link>
    </div>

    <div class="relative">
      <button
        @click="settingsOpen = !settingsOpen"
        class="p-2"
        aria-label="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z"
            :fill="isNight ? '#b7f7c6' : '#e8ffe9'"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            :fill="isNight ? '#0b401e' : '#0b3a1a'"
          />
        </svg>
      </button>

      <SettingsMenu v-if="settingsOpen" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '../composables/ThemeContext'
import SettingsMenu from './SettingsMenu.vue'

const { isNight } = useTheme()
const route = useRoute()
const settingsOpen = ref(false)
</script>