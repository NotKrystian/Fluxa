<template>
  <div class="text-sm mb-4">
    <div class="flex items-center justify-between mb-2">
      <div>Slippage tolerance</div>
      <div class="font-semibold">{{ modelValue.toFixed(1) }}%</div>
    </div>
    <input
      type="range"
      min="0"
      max="1"
      step="0.1"
      :value="modelValue"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      class="w-full"
      aria-label="Slippage tolerance"
    />
    <div class="text-xs opacity-70 mt-1">
      Drag to adjust between 0% and 1%
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  modelValue: number
}

defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>