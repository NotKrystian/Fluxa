<template>
  <div class="flex flex-col gap-6 lg:flex-row">
    <section
      :class="[
        'w-full max-w-[520px] rounded-2xl p-6 border shadow-lg',
        isNight ? 'bg-[#0a0a0a] border-[#0b401e]' : 'bg-white border-[#0b401e]'
      ]"
    >
      <header class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Swap</h2>
        <div class="flex items-center gap-2 text-xs">
          <span v-if="isConnected" class="opacity-70">Chain: {{ chainId || 'Unknown' }}</span>
          <span class="text-sm opacity-80">Cross-chain</span>
        </div>
      </header>

      <div v-if="isConnected" class="mb-4">
        <label class="text-sm opacity-80 mb-2 block">Select Network</label>
        <div class="flex gap-2">
          <button @click="handleChainSwitch(1)" :class="chainButtonClasses(chainId === 1)">Ethereum</button>
          <button @click="handleChainSwitch(8453)" :class="chainButtonClasses(chainId === 8453)">Base</button>
          <button @click="handleChainSwitch(42161)" :class="chainButtonClasses(chainId === 42161)">Arbitrum</button>
        </div>
      </div>

      <div class="mb-4">
        <label class="text-sm opacity-80 mb-1 block">From</label>
        <div class="flex gap-2">
          <TokenSelect :tokens="TOKENS" v-model="fromToken" />
          <NumberInput v-model="fromAmount" placeholder="0.0" />
        </div>
      </div>

      <div class="mb-4">
        <label class="text-sm opacity-80 mb-1 block">To</label>
        <div class="flex gap-2">
          <TokenSelect :tokens="TOKENS" v-model="toToken" />
          <NumberInput :model-value="quoteOutputAmount || '—'" read-only />
        </div>
      </div>

      <SlippageSlider v-model="slippage" />

      <button
        :class="[
          'w-full rounded-xl py-3 font-semibold mb-3 transition-opacity',
          (!isConnected || isQuoteLoading) ? 'opacity-60 cursor-not-allowed' : '',
          'bg-[#0b401e] text-[#b7f7c6]'
        ]"
        @click="getQuote"
        :disabled="!isConnected || isQuoteLoading"
      >
        {{
          isConnected
            ? isQuoteLoading
              ? 'Executing...'
              : 'Execute'
            : 'Connect Wallet to Execute'
        }}
      </button>

      <p v-if="quoteError" class="w-full rounded-xl border border-red-500/40 bg-red-500/10 text-sm text-red-500 px-3 py-2 mb-3">
        {{ quoteError }}
      </p>

      <div v-if="!isConnected" class="space-y-2">
        <button
          @click="handleWalletClick"
          :class="[
            'w-full rounded-xl py-2 font-semibold',
            isNight ? 'bg-[#b7f7c6] text-black' : 'bg-[#09320f] text-white'
          ]"
        >
          Connect Wallet
        </button>
      </div>
      <div v-else class="space-y-2">
        <div
          :class="[
            'w-full rounded-xl py-2 font-semibold border text-center',
            isNight ? 'border-white' : 'border-[#0b401e]'
          ]"
        >
          {{ formatAddress(address) }}
        </div>
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

      <div class="flex gap-2 mt-2">
        <button @click="showPoolOverview = !showPoolOverview" :class="toggleButtonClasses">Pool Overview</button>
        <button @click="showLPPositions = !showLPPositions" :class="toggleButtonClasses">LP Positions</button>
      </div>
    </section>

    <section class="flex flex-col gap-4 w-full lg:w-[347px] flex-shrink-0">
      <article
        :class="[
          'rounded-2xl border shadow-lg p-5 text-sm space-y-4 min-h-[260px]',
          isNight ? 'bg-[#050505] border-[#0b401e]' : 'bg-white border-[#0b401e]'
        ]"
      >
        <template v-if="quoteResult">
          <div class="flex items-center justify-between">
            <span class="opacity-70">Estimated output</span>
            <span class="font-semibold">{{ formatWithSymbol(quoteResult.estimatedOutput, toToken) }}</span>
          </div>
          <div v-if="quoteResult.netOutput" class="flex items-center justify-between">
            <span class="opacity-70">Net after gas</span>
            <span class="font-semibold text-[#0b401e]">
              {{ formatWithSymbol(quoteResult.netOutput, toToken) }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-70">Route type</span>
            <span :class="quoteResult.requiresMultiChain ? 'text-purple-500 font-semibold' : 'text-green-600 font-semibold'">
              {{ quoteResult.requiresMultiChain ? 'Multi-chain' : 'Arc only' }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-70">Gas cost</span>
            <span class="font-semibold">${{ quoteResult.totalGasCost?.toFixed(2) ?? '0.00' }}</span>
          </div>
          <div v-if="quoteResult.routingOptions?.length" class="space-y-1">
            <div class="text-xs uppercase tracking-wide opacity-60">Evaluated options</div>
            <ul class="space-y-1">
              <li
                v-for="(option, idx) in quoteResult.routingOptions.slice(0, 3)"
                :key="option.name + idx"
                class="flex items-center justify-between text-xs"
              >
                <span>{{ idx === 0 ? '✓' : idx + 1 }} {{ option.name }}</span>
                <span>{{ option.chains.join(' → ') }}</span>
              </li>
            </ul>
          </div>
          <div v-if="quoteResult.sourcePools?.length" class="space-y-1">
            <div class="text-xs uppercase tracking-wide opacity-60">Source pools</div>
            <ul class="space-y-1">
              <li
                v-for="pool in quoteResult.sourcePools"
                :key="pool.poolAddress + pool.chain"
                class="text-xs flex justify-between gap-2"
              >
                <span class="opacity-70">{{ pool.chain }}</span>
                <span class="font-medium">{{ formatTokenAmount(pool.amount, fromToken) }} {{ fromToken }}</span>
              </li>
            </ul>
          </div>
          <div v-if="quoteResult.cctpTransfers?.length" class="space-y-1">
            <div class="text-xs uppercase tracking-wide opacity-60">CCTP transfers</div>
            <ul class="space-y-1">
              <li
                v-for="transfer in quoteResult.cctpTransfers"
                :key="transfer.sourceChain + transfer.destinationChain + transfer.amount"
                class="text-xs flex justify-between gap-2"
              >
                <span class="opacity-70">{{ transfer.sourceChain }} → {{ transfer.destinationChain }}</span>
                <span class="font-medium">{{ formatTokenAmount(transfer.amount, fromToken) }} {{ fromToken }}</span>
              </li>
            </ul>
          </div>
        </template>
        <template v-else>
          <p class="text-sm opacity-70">Quote details will appear here once you enter an amount and fetch a route.</p>
        </template>
      </article>

      <article
        :class="[
          'rounded-2xl border shadow-lg p-5 text-sm space-y-4 min-h-[260px]',
          isNight ? 'bg-[#050505] border-[#0b401e]' : 'bg-white border-[#0b401e]'
        ]"
      >
        <template v-if="queueJob">
          <div class="flex items-center justify-between">
            <span class="opacity-70">Queue status</span>
            <span class="font-semibold">{{ queueStatusLabel }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-70">Position</span>
            <span class="font-semibold">{{ queueJob.position ? `#${queueJob.position}` : '—' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-70">Mock ETA</span>
            <span class="font-semibold">{{ formatEta(queueJob.etaMs) }}</span>
          </div>
          <div class="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div class="h-full bg-[#0b401e] transition-all duration-700 ease-out" :style="{ width: `${queueProgress}%` }"></div>
          </div>
          <ul v-if="queueJob.notes?.length" class="space-y-1 text-[11px] opacity-80">
            <li v-for="(note, idx) in queueJob.notes" :key="idx">• {{ note }}</li>
          </ul>
        </template>
        <template v-else>
          <p class="text-sm opacity-70">Queue progress will appear after you send a swap to the router.</p>
          <div class="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div class="h-full bg-[#0b401e]/30"></div>
          </div>
        </template>
        <p
          v-if="queueError"
          class="rounded-xl border border-yellow-400/40 bg-yellow-500/10 text-xs text-yellow-600 px-3 py-2"
        >
          {{ queueError }}
        </p>
      </article>

      <article class="space-y-4">
        <div
          v-if="showPoolOverview"
          :class="[
            'rounded-2xl p-4 border shadow-sm',
            isNight ? 'bg-[#070707] border-[#0b401e]' : 'bg-white border-white'
          ]"
        >
          <div class="flex justify-between mb-2">
            <span>Arc (Master)</span>
            <span>50% • 12,345,678 USDC</span>
          </div>
          <div class="flex justify-between">
            <span>Base (Satellite)</span>
            <span>30% • 7,654,321 USDC</span>
          </div>
          <div class="flex justify-between">
            <span>Ethereum (Mirror)</span>
            <span>20% • 4,321,000 USDC</span>
          </div>
        </div>

        <div
          v-if="showLPPositions"
          :class="[
            'rounded-2xl p-4 border shadow-sm',
            isNight ? 'bg-[#070707] border-[#0b401e]' : 'bg-white border-white'
          ]"
        >
          <p class="text-sm opacity-80">Add liquidity to any pool to see your positions here.</p>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { formatUnits, parseUnits } from 'ethers'
import { useTheme } from '../composables/ThemeContext'
import { useWeb3 } from '../composables/useWeb3'
import {
  getOptimalRoute,
  enqueueSwapJob,
  getSwapJob,
  type RouteResult,
  type SwapQueueJob
} from '../lib/fluxaBackend'
import { getTokenAddress, getTokenDecimals, supportedTokenSymbols } from '../lib/tokenConfig'
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

const TOKENS = supportedTokenSymbols.length ? supportedTokenSymbols : ['USDC', 'FLX']
const defaultFromToken = TOKENS[0]
const defaultToToken = TOKENS[1] || TOKENS[0]

const fromToken = ref(defaultFromToken)
const toToken = ref(defaultToToken)
const fromAmount = ref('')
const slippage = ref(0.5)
const showPoolOverview = ref(false)
const showLPPositions = ref(false)

const isQuoteLoading = ref(false)
const quoteResult = ref<RouteResult | null>(null)
const quoteError = ref<string | null>(null)
const queueJob = ref<SwapQueueJob | null>(null)
const queueError = ref<string | null>(null)
const isQueueing = ref(false)
const lastQuotePayload = ref<{ tokenIn: string; tokenOut: string; amountInRaw: string } | null>(null)

let autoQuoteTimeout: ReturnType<typeof setTimeout> | null = null
let queuePollInterval: ReturnType<typeof setInterval> | null = null

const formatTokenAmount = (value: string | undefined, symbol: string): string => {
  if (!value) return ''
  try {
    const formatted = formatUnits(value, getTokenDecimals(symbol))
    const num = Number(formatted)
    return Number.isNaN(num) ? formatted : num.toLocaleString(undefined, { maximumFractionDigits: 6 })
  } catch {
    return value
  }
}

const formatWithSymbol = (value: string | undefined, symbol: string) => {
  const amount = formatTokenAmount(value, symbol)
  return amount ? `${amount} ${symbol}` : '—'
}

const quoteOutputAmount = computed(() => {
  return quoteResult.value ? formatTokenAmount(quoteResult.value.estimatedOutput, toToken.value) : ''
})

const chainButtonClasses = (active: boolean) => {
  const activeClasses = 'bg-[#0b401e] text-white border-[#0b401e]'
  const idleClasses = 'border-[#0b401e]'
  return [
    'flex-1 rounded-xl py-2 px-3 text-sm border transition-colors',
    active ? activeClasses : idleClasses,
    isNight ? '' : ''
  ]
}

const toggleButtonClasses = computed(() => {
  return [
    'flex-1 rounded-xl py-2 border',
    isNight ? 'border-white' : 'border-[#0b401e]'
  ]
})

const queueStatusLabel = computed(() => {
  if (!queueJob.value) return ''
  const map: Record<string, string> = {
    queued: 'Queued',
    routing: 'Finding route',
    waiting_liquidity: 'Waiting for liquidity',
    executing: 'Executing on Arc',
    settling: 'Settling cross-chain leg',
    completed: 'Completed',
    failed: 'Failed'
  }
  return map[queueJob.value.status] || queueJob.value.status
})

const formatEta = (etaMs?: number | null) => {
  if (!etaMs || etaMs <= 0) return '—'
  const seconds = Math.ceil(etaMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

const queueProgress = computed(() => {
  if (!queueJob.value) return 0
  const steps = ['queued', 'routing', 'waiting_liquidity', 'executing', 'settling', 'completed']
  const idx = steps.indexOf(queueJob.value.status)
  if (idx === -1) return 0
  const progress = (idx / (steps.length - 1)) * 100
  if (queueJob.value.status === 'settling' && queueJob.value.etaMs && queueJob.value.etaMs > 0) {
    return Math.min(99, progress + 5)
  }
  return Math.min(progress, 100)
})

const resetQuoteState = () => {
  quoteResult.value = null
  quoteError.value = null
  queueJob.value = null
  queueError.value = null
  lastQuotePayload.value = null
}

const clearAutoQuoteTimeout = () => {
  if (autoQuoteTimeout) {
    clearTimeout(autoQuoteTimeout)
    autoQuoteTimeout = null
  }
}

const clearQueuePolling = () => {
  if (queuePollInterval) {
    clearInterval(queuePollInterval)
    queuePollInterval = null
  }
}

type FetchRouteOptions = {
  silent?: boolean
}

const fetchRoute = async (options: FetchRouteOptions = {}) => {
  const { silent = false } = options

  if (!isConnected.value) {
    if (!silent) alert('Please connect your wallet first')
    return null
  }

  const numericAmount = Number(fromAmount.value)
  if (!fromAmount.value || Number.isNaN(numericAmount) || numericAmount <= 0) {
    if (!silent) {
      quoteError.value = 'Enter a valid amount to request a quote.'
    }
    return null
  }

  const tokenInAddress = getTokenAddress(fromToken.value)
  const tokenOutAddress = getTokenAddress(toToken.value)
  if (!tokenInAddress || !tokenOutAddress) {
    quoteError.value = 'Configure token addresses in your .env.local before requesting a quote.'
    return null
  }

  let amountInRaw: string
  try {
    amountInRaw = parseUnits(fromAmount.value, getTokenDecimals(fromToken.value)).toString()
  } catch {
    quoteError.value = 'Amount precision is too high for this token.'
    return null
  }

  try {
    lastQuotePayload.value = {
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      amountInRaw
    }

    const route = await getOptimalRoute({
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      amountIn: amountInRaw,
      sourceChain: 'arc'
    })

    quoteResult.value = route
    quoteError.value = null
    return route
  } catch (error: any) {
    console.error('Failed to fetch quote:', error)
    quoteResult.value = null
    quoteError.value = error?.message || 'Failed to fetch quote'
    lastQuotePayload.value = null
    return null
  }
}

const scheduleAutoQuote = () => {
  clearAutoQuoteTimeout()
  if (!isConnected.value || isQuoteLoading.value) return
  const numericAmount = Number(fromAmount.value)
  if (!fromAmount.value || Number.isNaN(numericAmount) || numericAmount <= 0) return
  if (!getTokenAddress(fromToken.value) || !getTokenAddress(toToken.value)) return
  autoQuoteTimeout = setTimeout(() => {
    fetchRoute({ silent: true })
  }, 500)
}

const startQueuePolling = (jobId: string) => {
  clearQueuePolling()
  queuePollInterval = setInterval(async () => {
    try {
      const job = await getSwapJob(jobId)
      queueJob.value = job
      if (!job || ['completed', 'failed'].includes(job.status)) {
        clearQueuePolling()
      }
    } catch (error: any) {
      queueError.value = error?.message || 'Unable to fetch queue status'
      clearQueuePolling()
    }
  }, 2000)
}

watch([fromToken, toToken, fromAmount, slippage], () => {
  resetQuoteState()
  scheduleAutoQuote()
})

watch(
  isConnected,
  (connected) => {
    if (connected) {
      scheduleAutoQuote()
    } else {
      resetQuoteState()
      clearAutoQuoteTimeout()
      clearQueuePolling()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  clearAutoQuoteTimeout()
  clearQueuePolling()
})

const getQuote = async () => {
  if (isQuoteLoading.value) return
  isQuoteLoading.value = true
  try {
    const route = await fetchRoute()
    if (!route) return
    const humanOutput = formatTokenAmount(route.estimatedOutput, toToken.value)
    const message = `Route ${fromAmount.value} ${fromToken.value} -> ${humanOutput} ${toToken.value}`
    await signMessage(message)
    await enqueueSwapJobRequest()
  } catch (error: any) {
    console.error('Failed to sign swap:', error)
    quoteError.value = error?.message || 'Quote ready, but signature failed'
  } finally {
    isQuoteLoading.value = false
  }
}

const enqueueSwapJobRequest = async () => {
  if (!lastQuotePayload.value || !quoteResult.value) {
    queueError.value = 'Generate a quote before sending to queue.'
    return
  }
  if (isQueueing.value) return
  queueError.value = null
  isQueueing.value = true
  try {
    const job = await enqueueSwapJob({
      tokenIn: lastQuotePayload.value.tokenIn,
      tokenOut: lastQuotePayload.value.tokenOut,
      amountIn: lastQuotePayload.value.amountInRaw,
      sourceChain: 'arc',
      metadata: {
        slippageBps: Math.round(slippage.value * 100),
        estimatedOutput: quoteResult.value.estimatedOutput,
        requiresMultiChain: quoteResult.value.requiresMultiChain
      }
    })
    queueJob.value = job
    startQueuePolling(job.id)
  } catch (error: any) {
    queueError.value = error?.message || 'Failed to enqueue swap'
  } finally {
    isQueueing.value = false
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

const handleChainSwitch = async (targetChainId: number) => {
  try {
    await switchChain(targetChainId)
  } catch (error: any) {
    console.error('Failed to switch chain:', error)
    alert(error?.message || 'Failed to switch network')
  }
}
</script>
