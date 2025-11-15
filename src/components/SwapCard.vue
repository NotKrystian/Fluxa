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
        <div class="flex items-center gap-2">
          <!-- Chain indicator -->
          <div v-if="isConnected" class="text-xs opacity-70">
            Chain: {{ chainId || 'Unknown' }}
          </div>
          <div class="text-sm opacity-80">Cross-chain</div>
        </div>
      </div>

      <!-- Chain Selector (only show when connected) -->
      <div v-if="isConnected" class="mb-4">
        <label class="text-sm opacity-80 mb-2 block">Select Network</label>
        <div class="flex gap-2">
          <button
            @click="handleChainSwitch(1)"
            :class="[
              'flex-1 rounded-xl py-2 px-3 text-sm border transition-colors',
              chainId === 1
                ? isNight 
                  ? 'bg-[#0b401e] border-[#0b401e]' 
                  : 'bg-[#0b401e] text-white border-[#0b401e]'
                : isNight
                  ? 'border-[#0b401e]'
                  : 'border-[#0b401e]'
            ]"
          >
            Ethereum
          </button>
          <button
            @click="handleChainSwitch(8453)"
            :class="[
              'flex-1 rounded-xl py-2 px-3 text-sm border transition-colors',
              chainId === 8453
                ? isNight 
                  ? 'bg-[#0b401e] border-[#0b401e]' 
                  : 'bg-[#0b401e] text-white border-[#0b401e]'
                : isNight
                  ? 'border-[#0b401e]'
                  : 'border-[#0b401e]'
            ]"
          >
            Base
          </button>
          <button
            @click="handleChainSwitch(42161)"
            :class="[
              'flex-1 rounded-xl py-2 px-3 text-sm border transition-colors',
              chainId === 42161
                ? isNight 
                  ? 'bg-[#0b401e] border-[#0b401e]' 
                  : 'bg-[#0b401e] text-white border-[#0b401e]'
                : isNight
                  ? 'border-[#0b401e]'
                  : 'border-[#0b401e]'
            ]"
          >
            Arbitrum
          </button>
        </div>
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
        :disabled="!isConnected"
      >
        {{ isConnected ? 'Get Quote & Sign' : 'Connect Wallet to Get Quote' }}
      </button>

      <!-- WALLET -->
      <button
        v-if="!isConnected"
        @click="handleWalletClick"
        :class="[
          'w-full rounded-xl py-2 font-semibold',
          isNight ? 'bg-[#b7f7c6] text-black' : 'bg-[#09320f] text-white'
        ]"
      >
        Connect Wallet
      </button>

      <div v-else class="space-y-2">
        <!-- Connected address display -->
        <div
          :class="[
            'w-full rounded-xl py-2 font-semibold border text-center',
            isNight ? 'border-white' : 'border-[#0b401e]'
          ]"
        >
          {{ formatAddress(address) }}
        </div>
        
        <!-- Disconnect button -->
        <button
          @click="handleWalletClick"
          :class="[
            'w-full rounded-xl py-2 font-semibold',
            isNight ? 'bg-[#b7f7c6] text-black' : 'bg-[#09320f] text-white'
          ]"
        >
          Disconnect Wallet
        </button>
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
import { useWeb3 } from '../composables/useWeb3'
import TokenSelect from './TokenSelect.vue'
import NumberInput from './NumberInput.vue'
import SlippageSlider from './SlippageSlider.vue'

const { isNight } = useTheme()
const { 
  address, 
  isConnected, 
  connectWallet, 
  disconnectWallet, 
  formatAddress, 
  signMessage,
  switchChain,
  chainId
} = useWeb3()

const TOKENS = ['USDC', 'ETH', 'ARC', 'DAI']

const fromToken = ref('USDC')
const toToken = ref('ETH')
const fromAmount = ref('')
const toAmount = ref('')
const slippage = ref(0.5)
const showPoolOverview = ref(false)
const showLPPositions = ref(false)

const format = (n: string | number) => {
  if (n === '' || n === null || n === undefined) return ''
  const num = Number(n)
  if (Number.isNaN(num)) return ''
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

const getQuote = async () => {
  if (!isConnected.value) {
    alert('Please connect your wallet first')
    return
  }

  toAmount.value = fromAmount.value
    ? (Number(fromAmount.value) * 0.98).toString()
    : ''

  // Sign the swap transaction
  try {
    const message = `Swap ${fromAmount.value} ${fromToken.value} for ${toAmount.value} ${toToken.value} with ${slippage.value}% slippage`
    const signature = await signMessage(message)
    console.log('Swap signed:', signature)
    alert('Quote received and signed!')
  } catch (error) {
    console.error('Failed to sign swap:', error)
    alert('Failed to sign transaction')
  }
}

const handleWalletClick = async () => {
  if (isConnected.value) {
    disconnectWallet()
  } else {
    try {
      await connectWallet()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    }
  }
}

// Add chain switching function
const handleChainSwitch = async (targetChainId: number) => {
  try {
    await switchChain(targetChainId)
  } catch (error) {
    console.error('Failed to switch chain:', error)
    alert('Failed to switch network')
  }
}

// Example: Sign a message
const handleSignMessage = async () => {
  try {
    const message = `Confirm swap: ${fromAmount.value} ${fromToken.value} to ${toToken.value}`
    const signature = await signMessage(message)
    console.log('Signature:', signature)
    alert('Message signed successfully!')
  } catch (error) {
    console.error('Failed to sign message:', error)
  }
}
</script>