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

  // CCTP methods
  async initiateCCTP(request: {
    sourceChain: string;
    destinationChain: string;
    amount: string;
    recipient?: string;
    useFastAttestation?: boolean;
  }): Promise<any> {
    const response = await api.post('/api/cctp/initiate', request);
    return response.data.data;
  },

  async waitCCTPAttestation(txHash: string, useFastAttestation?: boolean): Promise<any> {
    const response = await api.post('/api/cctp/wait-attestation', { txHash, useFastAttestation });
    return response.data.data;
  },

  async completeCCTP(request: {
    attestation: string;
    message: string;
    destinationChain: string;
  }): Promise<any> {
    const response = await api.post('/api/cctp/complete', request);
    return response.data.data;
  },

  async executeFullCCTP(request: {
    sourceChain: string;
    destinationChain: string;
    amount: string;
    recipient?: string;
    useFastAttestation?: boolean;
  }): Promise<any> {
    const response = await api.post('/api/cctp/full-transfer', request);
    return response.data.data;
  },

  async getCCTPSupportedChains(): Promise<string[]> {
    const response = await api.get('/api/cctp/supported-chains');
    return response.data.data;
  },

  // New CCTP flow: create transfer, check deposit, execute
  async createCCTPTransfer(request: {
    sourceChain: string;
    destinationChain: string;
    amount: string;
    recipient?: string;
    useFastAttestation?: boolean;
  }): Promise<any> {
    const response = await api.post('/api/cctp/create-transfer', request);
    return response.data.data;
  },

  async checkCCTPDeposit(transferId: string, sourceChain?: string): Promise<any> {
    const params = sourceChain ? { sourceChain } : {};
    const response = await api.get(`/api/cctp/check-deposit/${transferId}`, { params });
    return response.data.data;
  },

  async executeCCTPTransfer(transferId: string, options?: {
    sourceChain?: string;
    destinationChain?: string;
    amount?: string;
    recipient?: string;
    useFastAttestation?: boolean;
  }): Promise<any> {
    const response = await api.post(`/api/cctp/execute/${transferId}`, options || {});
    return response.data.data;
  },

  async getCCTPTransferStatus(transferId: string): Promise<any> {
    const response = await api.get(`/api/cctp/status/${transferId}`);
    return response.data.data;
  },

  async getCCTPWalletAddress(chain: string): Promise<string> {
    const response = await api.get(`/api/cctp/wallet-address/${chain}`);
    return response.data.data.address;
  },

  async getCCTPWalletBalance(chain: string, sourceChain?: string, destinationChain?: string, amount?: string): Promise<any> {
    const params = new URLSearchParams();
    if (sourceChain) params.append('sourceChain', sourceChain);
    if (destinationChain) params.append('destinationChain', destinationChain);
    if (amount) params.append('amount', amount);
    const queryString = params.toString();
    const url = `/api/cctp/wallet-balance/${chain}${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response.data.data;
  },

  // Gateway methods
  async depositToGateway(request: {
    chain: string;
    token: string;
    amount: string;
    depositor?: string;
    useOnChain?: boolean;
  }): Promise<any> {
    const response = await api.post('/api/gateway/deposit', request);
    return response.data.data;
  },

  async withdrawFromGateway(request: {
    token: string;
    amount: string;
    targetChain: string;
    recipient: string;
    depositor?: string;
  }): Promise<any> {
    const response = await api.post('/api/gateway/withdraw', request);
    return response.data.data;
  },

  async getGatewayWithdrawalStatus(withdrawalId: string): Promise<any> {
    const response = await api.get(`/api/gateway/withdrawal-status/${withdrawalId}`);
    return response.data.data;
  },
};

export default apiClient;

