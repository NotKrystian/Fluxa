/**
 * Backend API Client
 * 
 * Connects frontend to the Fluxa routing backend
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface LPDepth {
  chain: string;
  poolAddress: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  reserve0Formatted: string;
  reserve1Formatted: string;
  tvl: number;
  utilization: number;
  lastUpdate: number;
  mock?: boolean;
}

export interface QuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  sourceChain?: string;
}

export interface QuoteResponse {
  single?: {
    chain: string;
    expectedOutput: string;
    slippageBps: number;
    gasCost: number;
  };
  multiChain?: any;
  recommendation: 'single' | 'multiChain';
}

export interface HighValueSwapRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  recipient: string;
  sourceChain?: string;
  slippageTolerance?: number;
}

export interface HighValueSwapResponse {
  success: boolean;
  data?: {
    steps: Array<{ step: string; status: string; result?: any; error?: string }>;
    output: string;
    txHash: string;
    route: any;
  };
  multiChain: boolean;
  message?: string;
  error?: string;
}

// API methods
export const apiClient = {
  // Health check
  async health(): Promise<{ status: string; timestamp: number }> {
    const response = await api.get('/health');
    return response.data;
  },

  // Get LP depths across all chains
  async getLPDepths(): Promise<Record<string, LPDepth[]>> {
    const response = await api.get('/api/lp-depths');
    return response.data.data;
  },

  // Get LP depths for specific chain
  async getChainDepths(chain: string): Promise<LPDepth[]> {
    const response = await api.get(`/api/lp-depths/${chain}`);
    return response.data.data;
  },

  // Get quote for a trade
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const response = await api.post('/api/quote', request);
    return response.data.data;
  },

  // Execute high-value swap with multi-chain routing
  async executeHighValueSwap(request: HighValueSwapRequest): Promise<HighValueSwapResponse> {
    const response = await api.post('/api/execute-highvalue', request);
    return response.data;
  },

  // Get rebalancing status
  async getRebalanceStatus(): Promise<any> {
    const response = await api.get('/api/rebalance/status');
    return response.data.data;
  },

  // Analyze imbalances
  async analyzeImbalances(): Promise<any> {
    const response = await api.post('/api/rebalance/analyze');
    return response.data.data;
  },

  // Get Gateway balance
  async getGatewayBalance(address: string, token: string): Promise<string> {
    const response = await api.get(`/api/gateway/balance/${address}/${token}`);
    return response.data.data.balance;
  },
};

export default apiClient;

