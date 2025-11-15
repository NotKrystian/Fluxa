const resolveBaseUrl = (): string => {
  const candidates = [
    import.meta.env.VITE_FLUXA_BACKEND_URL,
    import.meta.env.NEXT_PUBLIC_FLUXA_BACKEND_URL
  ]

  const url = candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0)
  if (!url) {
    throw new Error(
      'Missing Fluxa backend URL. Set VITE_FLUXA_BACKEND_URL (or NEXT_PUBLIC_FLUXA_BACKEND_URL) in your .env.local file.'
    )
  }

  return url.replace(/\/$/, '')
}

const BASE_URL = resolveBaseUrl()

export type RouteRequest = {
  tokenIn: string
  tokenOut: string
  amountIn: string
  sourceChain?: string
}

export type SourcePool = {
  chain: string
  poolAddress: string
  amount: string
  expectedOutput: string
}

export type RouteTransfer = {
  sourceChain: string
  destinationChain: string
  amount: string
}

export type RoutingOption = {
  name: string
  netOutput: string
  grossOutput: string
  gasCostUSD: number
  chains: string[]
  remoteChains?: string[]
}

export type RouteResult = {
  requiresMultiChain: boolean
  tokenIn: string
  tokenOut: string
  totalAmountIn: string
  executionChain: string
  estimatedOutput: string
  netOutput: string
  totalGasCost: number
  gasCostToken: string
  routingOptions?: RoutingOption[]
  sourcePools?: SourcePool[]
  cctpTransfers?: RouteTransfer[]
  gatewayWithdrawals?: RouteTransfer[]
  recommendation?: string
  [key: string]: unknown
}

export type ExecuteRoutePayload = {
  tokenIn: string
  tokenOut: string
  amountIn: string
  minAmountOut: string
  recipient: string
  sourceChain?: string
  slippageTolerance?: number
}

export type ExecuteRouteData = {
  steps: Array<{ step: string; status: string; result?: unknown; error?: string }>
  output: string
  txHash: string
  route: RouteResult
}

export type ExecuteRouteResponse = {
  success: boolean
  data?: ExecuteRouteData
  multiChain?: boolean
  message?: string
  error?: string
}

export type SwapQueueRequest = {
  tokenIn: string
  tokenOut: string
  amountIn: string
  sourceChain?: string
  metadata?: Record<string, unknown>
}

export type SwapQueueJob = {
  id: string
  status: string
  createdAt: number
  updatedAt: number
  route: RouteResult | null
  request: SwapQueueRequest
  position: number | null
  notes: string[]
  attempts: number
  etaMs: number | null
}

type BackendResponse<T> = {
  success: boolean
  data?: T
  message?: string
  error?: string
}

class FluxaBackendError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'FluxaBackendError'
    this.status = status
    this.details = details
  }
}

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })

  if (!response.ok) {
    let errorBody: unknown

    try {
      errorBody = await response.json()
    } catch {
      // ignore parsing errors
    }

    throw new FluxaBackendError(
      `Fluxa backend error ${response.status}`,
      response.status,
      errorBody
    )
  }

  return response.json() as Promise<T>
}

const unwrap = <T>(payload: BackendResponse<T>, endpoint: string): T => {
  if (payload.success && payload.data) {
    return payload.data
  }

  const message = payload.error || payload.message || `Fluxa backend error at ${endpoint}`
  throw new FluxaBackendError(message, 500, payload)
}

export async function getOptimalRoute(req: RouteRequest): Promise<RouteResult> {
  const payload = await request<BackendResponse<RouteResult>>('/api/quote', {
    method: 'POST',
    body: JSON.stringify(req)
  })

  return unwrap(payload, '/api/quote')
}

export async function executeRoute(
  executionPayload: ExecuteRoutePayload
): Promise<ExecuteRouteResponse> {
  return request<ExecuteRouteResponse>('/api/execute-highvalue', {
    method: 'POST',
    body: JSON.stringify(executionPayload)
  })
}

export async function enqueueSwapJob(payload: SwapQueueRequest): Promise<SwapQueueJob> {
  const response = await request<BackendResponse<SwapQueueJob>>('/api/queue/jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  return unwrap(response, '/api/queue/jobs')
}

export async function getSwapJob(jobId: string): Promise<SwapQueueJob> {
  const response = await request<BackendResponse<SwapQueueJob>>(`/api/queue/jobs/${jobId}`, {
    method: 'GET'
  })

  return unwrap(response, `/api/queue/jobs/${jobId}`)
}
