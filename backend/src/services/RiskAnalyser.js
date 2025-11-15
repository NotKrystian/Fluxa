// src/services/RiskAnalyzer.js (new file)
import { getRiskScore } from '../advanced/stablecoin/risk.js';
import { failureForRoute } from '../advanced/simulator/failureModel.js';

export class RiskAnalyzer {
  analyzeRoute(route) {
    // Token risk
    const tokenRisk = getRiskScore(route.tokenIn, route.sourceChain);
    
    // Failure probability
    const failureProb = failureForRoute(route);
    
    // Combined risk score
    return {
      tokenRisk: tokenRisk.score,
      failureProbability: failureProb,
      overallRisk: 1 - (tokenRisk.score * (1 - failureProb)),
      breakdown: {
        tokenMetrics: tokenRisk.metrics,
        failureFactors: route.hops?.map(h => failureForRoute({ hops: [h] }))
      }
    };
  }
}