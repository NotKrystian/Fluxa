// src/lib/fluxaBackend.ts
const BASE_URL = process.env.NEXT_PUBLIC_FLUXA_BACKEND_URL!;

export type RouteRequest = {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;      // or bigint -> string
  slippageBps: number;
};

export type RouteResult = {
  steps: any[];
  minAmountOut: string;
  // add fields to match backend response
};

export async function getOptimalRoute(req: RouteRequest): Promise<RouteResult> {
  const res = await fetch(`${BASE_URL}/highvalue/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Backend error ${res.status}`);
  }

  return res.json();
}

export async function executeRoute(executionPayload: any): Promise<{ txHash: string }> {
  const res = await fetch(`${BASE_URL}/highvalue/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(executionPayload),
  });

  if (!res.ok) {
    throw new Error(`Backend error ${res.status}`);
  }

  return res.json();
}
