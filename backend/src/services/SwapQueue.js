import { randomUUID } from 'crypto'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

const DEFAULT_OPTIONS = {
  initialLiquidity: '1000000',
  executionDelayMs: 1500,
  settlementDelayMs: 4000,
  rebalanceDelayMs: 6000
}

export class SwapQueue {
  constructor(routeOptimizer, options = {}) {
    this.routeOptimizer = routeOptimizer
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.maxLiquidity = BigInt(this.options.initialLiquidity)
    this.availableLiquidity = BigInt(this.options.initialLiquidity)
    this.executionDelayMs = Number(this.options.executionDelayMs)
    this.settlementDelayMs = Number(this.options.settlementDelayMs)
    this.rebalanceDelayMs = Number(this.options.rebalanceDelayMs)
    this.jobs = []
    this.processing = false
  }

  enqueue(request) {
    if (!request?.tokenIn || !request?.tokenOut || !request?.amountIn) {
      throw new Error('Missing required fields: tokenIn, tokenOut, amountIn')
    }

    const job = {
      id: randomUUID(),
      request,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notes: [],
      route: null,
      attempts: 0
    }

    this.jobs.push(job)
    this.processNext()
    return this.serializeJob(job)
  }

  listJobs() {
    return this.jobs.map((job) => this.serializeJob(job))
  }

  getJob(jobId) {
    const job = this.jobs.find((item) => item.id === jobId)
    if (!job) return null
    return this.serializeJob(job)
  }

  serializeJob(job) {
    const pendingJobs = this.jobs.filter((item) => !TERMINAL_STATUSES.has(item.status))
    const position = pendingJobs.findIndex((item) => item.id === job.id)

    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      route: job.route
        ? {
            requiresMultiChain: job.route.requiresMultiChain,
            estimatedOutput: job.route.estimatedOutput,
            netOutput: job.route.netOutput,
            sourcePools: job.route.sourcePools || [],
            cctpTransfers: job.route.cctpTransfers || []
          }
        : null,
      request: job.request,
      position: position === -1 ? null : position + 1,
      notes: job.notes,
      attempts: job.attempts,
      etaMs: job.etaMs || null
    }
  }

  async processNext() {
    if (this.processing) return

    const job = this.jobs.find((item) => {
      if (item.status === 'queued') return true
      if (item.status === 'waiting_liquidity') {
        try {
          return BigInt(item.request.amountIn) <= this.availableLiquidity
        } catch {
          return false
        }
      }
      return false
    })

    if (!job) return

    this.processing = true
    try {
      await this.processJob(job)
    } finally {
      this.processing = false
      setTimeout(() => this.processNext(), 25)
    }
  }

  async processJob(job) {
    job.attempts += 1
    job.status = 'routing'
    job.updatedAt = Date.now()

    let amountInRaw
    try {
      amountInRaw = BigInt(job.request.amountIn)
    } catch {
      job.status = 'failed'
      job.updatedAt = Date.now()
      job.notes.push('Invalid amount provided')
      return
    }

    try {
      job.route = await this.routeOptimizer.getQuote({
        tokenIn: job.request.tokenIn,
        tokenOut: job.request.tokenOut,
        amountIn: job.request.amountIn,
        sourceChain: job.request.sourceChain || 'arc'
      })
    } catch (error) {
      job.status = 'failed'
      job.updatedAt = Date.now()
      job.notes.push(`Route optimizer failed: ${error.message}`)
      return
    }

    if (amountInRaw > this.availableLiquidity) {
      job.status = 'waiting_liquidity'
      job.updatedAt = Date.now()
      job.notes.push('Insufficient mock liquidity on Arc, waiting for rebalance')
      return
    }

    this.availableLiquidity -= amountInRaw
    job.status = 'executing'
    job.updatedAt = Date.now()
    job.etaMs = this.executionDelayMs + this.settlementDelayMs

    setTimeout(() => {
      job.status = 'settling'
      job.updatedAt = Date.now()
      job.notes.push('Multi-chain leg executing')

      setTimeout(() => {
        job.status = 'completed'
        job.updatedAt = Date.now()
        job.notes.push('Swap settled and liquidity restored')
        this.releaseLiquidity(amountInRaw)
      }, this.settlementDelayMs)
    }, this.executionDelayMs)
  }

  releaseLiquidity(amount) {
    this.availableLiquidity += amount
    if (this.availableLiquidity > this.maxLiquidity) {
      this.availableLiquidity = this.maxLiquidity
    }

    setTimeout(() => this.processNext(), 10)
  }
}
