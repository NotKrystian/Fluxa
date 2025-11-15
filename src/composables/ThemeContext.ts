import { ref, computed, watch } from 'vue'

type ThemeValue = 'night' | 'light'

const theme = ref<ThemeValue>('night')

export function useTheme() {
  const isNight = computed(() => theme.value === 'night')

  const setTheme = (value: ThemeValue) => {
    theme.value = value
  }

  watch(isNight, (newIsNight) => {
    document.body.className = newIsNight ? 'bg-black' : 'bg-white'
  }, { immediate: true })

  return {
    theme,
    setTheme,
    isNight
  }
}