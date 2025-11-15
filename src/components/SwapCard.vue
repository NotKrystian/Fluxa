<template>
  <div>
    <div
      :class="[
        'w-full max-w-[520px] rounded-2xl p-6 border shadow-lg',
        isNight ? 'bg-[#0a0a0a] border-[#0b401e]' : 'bg-white border-[#0b401e]'
      ]"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Swap</h2>
        <div class="text-sm opacity-80">Cross-chain</div>
      </div>

      <!-- FROM -->
      <div class="mb-4">
        <label class="text-sm opacity-80 mb-1 block">From</label>
        <div class="flex gap-2">
          <TokenSelect
            :tokens="TOKENS"
            v-model="fromToken"
          />
          <NumberInput
            v-model="fromAmount"
            placeholder="0.0"
          />
        </div>
      </div>

      <!-- TO -->
      <div class="mb-4">
        <label class="text-sm opacity-80 mb-1 block">To</label>
        <div class="flex gap-2">
          <TokenSelect :tokens="TOKENS" v-model="toToken" />
          <NumberInput :model-value="format(toAmount) || '—'" read-only />
        </div>
      </div>

      <!-- SLIPPAGE -->
      <SlippageSlider v-model="slippage" />

      <!-- GET QUOTE -->
      <button
        :class="[
          'w-full rounded-xl py-3 font-semibold mb-3',
          isNight
            ? 'bg-[#0b401e] text-[#b7f7c6]'
            : 'bg-[#0b401e] text-[#b7f7c6]'
        ]"
        @click="getQuote"
      >
        Get Quote
      </button>

      <!-- WALLET -->
      <button
        v-if="!walletConnected"
        @click="connectWallet"
        :class="[
          'w-full rounded-xl py-2 font-semibold',
          isNight ? 'bg-[#b7f7c6] text-black' : 'bg-[#09320f] text-white'
        ]"
      >
        Connect Wallet
      </button>
      <div
        v-else
        class="w-full rounded-xl py-2 font-semibold flex items-center justify-center border"
      >
        Wallet Connected
      </div>

      <!-- TOGGLE BUTTONS -->
      <div class="flex gap-2 mt-2">
        <button
          @click="showPoolOverview = !showPoolOverview"
          :class="[
            'flex-1 rounded-xl py-2 border',
            isNight ? 'border-white' : 'border-[#0b401e]'
          ]"
        >
          Pool Overview
        </button>
        <button
          @click="showLPPositions = !showLPPositions"
          :class="[
            'flex-1 rounded-xl py-2 border',
            isNight ? 'border-white' : 'border-[#0b401e]'
          ]"
        >
          LP Positions
        </button>
      </div>
    </div>

    <!-- POOL OVERVIEW CARD -->
    <div
      v-if="showPoolOverview"
      :class="[
        'w-full max-w-[520px] mt-4 rounded-2xl p-4 border shadow-sm',
        isNight ? 'bg-[#070707] border-[#0b401e]' : 'bg-white border-white'
      ]"
    >
      <div class="flex justify-between mb-2">
        <div>Arc (Master)</div>
        <div>50% • 12,345,678 USDC</div>
      </div>
      <div class="flex justify-between">
        <div>Base (Satellite)</div>
        <div>30% • 7,654,321 USDC</div>
      </div>
      <div class="flex justify-between">
        <div>Ethereum (Mirror)</div>
        <div>20% • 4,321,000 USDC</div>
      </div>
    </div>

    <!-- LP POSITIONS CARD -->
    <div
      v-if="showLPPositions"
      :class="[
        'w-full max-w-[520px] mt-4 rounded-2xl p-4 border shadow-sm',
        isNight ? 'bg-[#070707] border-[#0b401e]' : 'bg-white border-white'
      ]"
    >
      <div class="text-sm opacity-80">
        Add liquidity to any pool to see your positions here.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from '../composables/ThemeContext'
import TokenSelect from './TokenSelect.vue'
import NumberInput from './NumberInput.vue'
import SlippageSlider from './SlippageSlider.vue'

const { isNight } = useTheme()
const TOKENS = ['USDC', 'ETH', 'ARC', 'DAI']

const fromToken = ref('USDC')
const toToken = ref('ETH')
const fromAmount = ref('')
const toAmount = ref('')
const walletConnected = ref(false)
const slippage = ref(0.5)
const showPoolOverview = ref(false)
const showLPPositions = ref(false)

const connectWallet = () => {
  walletConnected.value = true
}

const format = (n: string | number) => {
  if (n === '' || n === null || n === undefined) return ''
  const num = Number(n)
  if (Number.isNaN(num)) return ''
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

const getQuote = () => {
  toAmount.value = fromAmount.value
    ? (Number(fromAmount.value) * 0.98).toString()
    : ''
}
</script>