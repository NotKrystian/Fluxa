<template>
  <div
    :class="[
      'w-full max-w-[1040px] rounded-2xl p-6 border shadow-lg',
      isNight ? 'bg-[#0a0a0a] border-[#0b401e]' : 'bg-white border-[#0b401e]'
    ]"
  >
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
      <div>
        <h1 class="text-2xl font-semibold">Liquidity Pools</h1>
        <p class="text-sm opacity-70">
          All pools • Showing pool and TVL only
        </p>
      </div>

      <!-- Simple "All chains" pill (visual only) -->
      <div class="flex gap-2 justify-start md:justify-end">
        <button
          :class="[
            'px-3 py-1.5 rounded-full text-xs font-medium border',
            isNight
              ? 'border-[#0b401e] bg-[#0b401e]/30'
              : 'border-[#0b401e] bg-[#0b401e]/5'
          ]"
        >
          All chains
        </button>
      </div>
    </div>

    <!-- SEARCH & SORT -->
    <div class="flex flex-col md:flex-row gap-3 md:items-center mb-4">
      <!-- Search bar -->
      <div
        :class="[
          'flex items-center gap-2 px-3 py-2 rounded-xl border flex-1',
          isNight ? 'border-[#0b401e] bg-[#050505]' : 'border-[#0b401e] bg-white'
        ]"
      >
        <span class="text-xs opacity-70">🔍</span>
        <input
          v-model="search"
          type="text"
          placeholder="Search pools (e.g. USDC, ETH, Base)"
          :class="[
            'w-full text-sm bg-transparent outline-none',
            isNight ? 'placeholder-[#777]' : 'placeholder-[#666]'
          ]"
        />
      </div>

      <!-- Sort pill (TVL only, visual for now) -->
      <div class="flex gap-2">
        </div>
    </div>

    <!-- TABLE HEADER -->
    <div
      class="px-4 py-2 text-[11px] font-medium uppercase tracking-wide opacity-60 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <div>Pool</div>
      <div class="text-right">TVL</div>
    </div>

    <!-- TABLE BODY -->
    <div
      :class="[
        'rounded-2xl border overflow-hidden',
        isNight ? 'border-[#0b401e]' : 'border-[#0b401e]/50'
      ]"
    >
      <PoolRow
        v-for="pool in filteredPools"
        :key="pool.id"
        :pool="pool"
        :format-usd="formatUSD"
      />

      <!-- EMPTY STATE -->
      <div
        v-if="!filteredPools.length"
        class="py-8 text-center text-sm opacity-70"
      >
        No pools found. Try a different search.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTheme } from '../composables/ThemeContext'
import PoolRow from './PoolRow.vue'

const { isNight } = useTheme()

export interface Pool {
  id: number
  token0: string
  token1: string
  chain: string
  type: string
  tvl: number
}

// Mock data – swap this out for your real data source later
const pools = ref<Pool[]>([
  { id: 1, token0: 'USDC', token1: 'ETH', chain: 'Base', type: 'Volatile', tvl: 12_345_678 },
  { id: 2, token0: 'USDC', token1: 'ARC', chain: 'Arc', type: 'Stable', tvl: 7_654_321 },
  { id: 3, token0: 'DAI', token1: 'ETH', chain: 'Ethereum', type: 'Stable', tvl: 4_321_000 },
  { id: 4, token0: 'USDC', token1: 'BTC', chain: 'Base', type: 'Volatile', tvl: 18_900_000 },
  { id: 5, token0: 'ARC', token1: 'ETH', chain: 'Arc', type: 'Volatile', tvl: 2_450_000 }
])

const search = ref('')

const filteredPools = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return pools.value
  return pools.value.filter((pool) => {
    const haystack = `${pool.token0}${pool.token1}${pool.chain}${pool.type}`.toLowerCase()
    return haystack.includes(q)
  })
})

const formatUSD = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
</script>
