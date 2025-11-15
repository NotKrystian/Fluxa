<template>
  <input
    :type="readOnly ? 'text' : 'number'"
    :value="modelValue"
    @input="!readOnly && emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    :placeholder="placeholder"
    :readonly="readOnly"
    :write="write"
    :class="baseClasses"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '../composables/ThemeContext'

interface Props {
  modelValue: string
  placeholder?: string
  readOnly?: boolean
  write?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  readOnly: false,
  write: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { isNight } = useTheme()

const baseClasses = computed(() => {
  const base = 'border rounded-xl px-3 py-2 '
  const theme = isNight.value
    ? 'border-[#0b401e] placeholder-[#b7f7c6] bg-black'
    : 'border-[#0b401e] placeholder-[#0b401e] bg-transparent'
  const readOnlyClass = props.readOnly ? ' bg-transparent' : ''
  return base + theme + readOnlyClass
})
</script>