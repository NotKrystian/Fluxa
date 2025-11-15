

export class CircleFallback {
  constructor(circleTransfer, circleStatus) {
    this.circleTransfer = circleTransfer;
    this.circleStatus = circleStatus;
    
    this.thresholds = {
      attestationTimeout: 180,
      maxRetries: 3,
      minSuccessRate: 0.8
    };
  }

  shouldFallback(transferStatus, elapsedSeconds) {
    if (transferStatus.status === 'initiated' && elapsedSeconds > this.thresholds.attestationTimeout) {
      return {
        shouldFallback: true,
        reason: 'attestation_timeout',
        elapsed: elapsedSeconds
      };
    }

    if (transferStatus.status === 'failed') {
      return {
        shouldFallback: true,
        reason: 'transfer_failed',
        errors: transferStatus.errors
      };
    }

    const stats = this.circleStatus.getStatistics();
    const route = `${transferStatus.sourceChain}-${transferStatus.destinationChain}`;
    
    if (stats.byChain[route]) {
      const routeStats = stats.byChain[route];
      const successRate = routeStats.completed / routeStats.count;
      
      if (successRate < this.thresholds.minSuccessRate) {
        return {
          shouldFallback: true,
          reason: 'low_success_rate',
          successRate: (successRate * 100).toFixed(2) + '%'
        };
      }
    }

    return { shouldFallback: false, reason: null };
  }

  async getFallbackOptions(transferData) {
    const options = [];

    if (transferData.useFastAttestation) {
      options.push({
        strategy: 'retry_standard',
        description: 'Retry CCTP with standard attestation',
        estimatedTime: 900,
        confidence: 0.9,
        cost: 'low'
      });
    }

    options.push({
      strategy: 'alternative_bridge',
      description: 'Use alternative bridge',
      estimatedTime: 300,
      confidence: 0.85,
      cost: 'medium'
    });

    options.sort((a, b) => b.confidence - a.confidence);
    return options;
  }

  async executeFallback(transferData, strategy) {
    switch (strategy.strategy) {
      case 'retry_standard':
        return this.circleTransfer.executeFullTransfer({
          ...transferData,
          useFastAttestation: false
        });

      case 'alternative_bridge':
        return {
          success: false,
          error: 'Alternative bridge not yet implemented'
        };

      default:
        throw new Error(`Unknown fallback strategy: ${strategy.strategy}`);
    }
  }

  getFallbackStats() {
    const stats = this.circleStatus.getStatistics();
    return {
      totalTransfers: stats.total,
      failedTransfers: stats.failed,
      fallbackRate: stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(2) + '%' : '0%'
    };
  }
}
