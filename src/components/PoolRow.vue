<template>
  <!-- 
    Each pool row is a two-column grid:
    - Left: Pool info (tokens + chain + type)
    - Right: TVL value
  -->
  <div
    class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center px-4 py-3 text-sm transition-colors"
  >
    <!-- LEFT SIDE: Pool information (non-clickable) -->
    <div class="flex items-center gap-3">
      
      <!-- Token Icons (simple circle initials, overlapped like PancakeSwap) -->
      <div class="flex -space-x-2">
        
        <!-- Token 0 circle -->
        <div
          :class="[
            'h-7 w-7 rounded-full border flex items-center justify-center text-[10px] font-semibold',
            isNight
              ? 'border-[#0b401e] bg-[#0b401e]'  // Dark mode
              : 'border-[#0b401e] bg-white'      // Light mode
          ]"
        >
          {{ pool.token0[0] }} <!-- First letter of token0 -->
        </div>

        <!-- Token 1 circle -->
        <div
          :class="[
            'h-7 w-7 rounded-full border flex items-center justify-center text-[10px] font-semibold',
            isNight
              ? 'border-[#0b401e] bg-[#0b401e]'  // Dark mode
              : 'border-[#0b401e] bg-white'      // Light mode
          ]"
        >
          {{ pool.token1[0] }} <!-- First letter of token1 -->
        </div>
      </div>

      <!-- Token names + chain info -->
      <div>
        <!-- Example: USDC/ETH -->
        <div class="font-medium">
          {{ pool.token0 }}/{{ pool.token1 }}
        </div>

        <!-- Example: Base • Volatile -->
        <div class="text-xs opacity-70">
          {{ pool.chain }} • {{ pool.type }}
        </div>
      </div>
    </div>

    <!-- RIGHT SIDE: TVL value -->
    <div class="text-right">
      <div class="font-semibold">
        {{ formatUsd(pool.tvl) }} <!-- TVL formatted as currency -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
  This component displays a single row in the Pools list.

  Props:
  - pool      → a single pool object (token0, token1, tvl, chain, type)
  - formatUsd → a formatting function passed from parent (PoolsCard)

  Theme:
  - isNight   → comes from your ThemeContext to match dark/light mode styling.
*/

import { useTheme } from '../composables/ThemeContext'
import type { Pool } from './PoolsCard.vue'

const props = defineProps<{
  pool: Pool
  formatUsd: (n: number) => string
}>()

// Theme context (controls dark/light styles)
const { isNight } = useTheme()
</script>
