<template>
  <select
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    :class="[
      'border rounded-xl px-3 py-2 flex-1',
      isNight ? 'border-[#0b401e]' : 'border-[#0b401e]'
    ]"
  >
    <option v-for="token in tokens" :key="token" :value="token">
      {{ token }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { useTheme } from '../composables/ThemeContext'

interface Props {
  tokens: string[]
  modelValue: string
}

defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { isNight } = useTheme()
</script>