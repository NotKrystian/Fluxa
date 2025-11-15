// Monitors transfer states, confirmations, and success/failure metrics.
export class CircleTransferStatus {
  constructor() {
    this.transfers = new Map();
    this.statusHistory = [];
    this.maxHistorySize = 1000;
  }

  registerTransfer(transferData) {
    const { txHash, sourceChain, destinationChain, amount, recipient, timestamp = Date.now() } = transferData;

    const record = {
      txHash,
      sourceChain,
      destinationChain,
      amount: amount.toString(),
      recipient,
      status: 'initiated',
      stages: {
        burn: { status: 'complete', txHash, timestamp },
        attestation: { status: 'pending', timestamp: null },
        mint: { status: 'pending', txHash: null, timestamp: null }
      },
      timestamps: {
        initiated: timestamp,
        attested: null,
        completed: null
      },
      errors: []
    };

    this.transfers.set(txHash, record);
    return record;
  }

  updateStatus(txHash, stage, data) {
    const transfer = this.transfers.get(txHash);
    if (!transfer) return null;

    switch (stage) {
      case 'attestation':
        transfer.stages.attestation = {
          status: data.success ? 'complete' : 'failed',
          timestamp: Date.now(),
          elapsed: data.elapsed,
          fast: data.fast
        };
        if (data.success) {
          transfer.timestamps.attested = Date.now();
          transfer.status = 'attested';
        } else {
          transfer.status = 'failed';
          transfer.errors.push({ stage: 'attestation', error: data.error, timestamp: Date.now() });
        }
        break;

      case 'mint':
        transfer.stages.mint = {
          status: data.success ? 'complete' : 'failed',
          txHash: data.txHash,
          timestamp: Date.now()
        };
        if (data.success) {
          transfer.timestamps.completed = Date.now();
          transfer.status = 'complete';
          this._archiveTransfer(transfer);
        } else {
          transfer.status = 'failed';
          transfer.errors.push({ stage: 'mint', error: data.error, timestamp: Date.now() });
        }
        break;
    }

    this.transfers.set(txHash, transfer);
    return transfer;
  }

  getStatus(txHash) {
    const transfer = this.transfers.get(txHash);
    if (!transfer) {
      const historical = this.statusHistory.find(t => t.txHash === txHash);
      return historical || null;
    }

    return {
      ...transfer,
      duration: this._calculateDuration(transfer),
      progress: this._calculateProgress(transfer)
    };
  }

  getActiveTransfers() {
    const active = [];
    for (const transfer of this.transfers.values()) {
      if (transfer.status !== 'complete' && transfer.status !== 'failed') {
        active.push({
          ...transfer,
          duration: this._calculateDuration(transfer),
          progress: this._calculateProgress(transfer)
        });
      }
    }
    return active;
  }

  getStatistics() {
    const all = [...this.transfers.values(), ...this.statusHistory];
    
    const stats = {
      total: all.length,
      active: this.transfers.size,
      completed: 0,
      failed: 0,
      avgDuration: 0,
      byChain: {}
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const transfer of all) {
      if (transfer.status === 'complete') {
        stats.completed++;
        totalDuration += this._calculateDuration(transfer);
        completedCount++;
      }
      if (transfer.status === 'failed') stats.failed++;

      const key = `${transfer.sourceChain}-${transfer.destinationChain}`;
      if (!stats.byChain[key]) {
        stats.byChain[key] = { count: 0, completed: 0, failed: 0 };
      }
      stats.byChain[key].count++;
      if (transfer.status === 'complete') stats.byChain[key].completed++;
      if (transfer.status === 'failed') stats.byChain[key].failed++;
    }

    stats.avgDuration = completedCount > 0 ? totalDuration / completedCount : 0;
    stats.successRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(2) + '%' : '0%';

    return stats;
  }

  _calculateDuration(transfer) {
    if (transfer.timestamps.completed) {
      return (transfer.timestamps.completed - transfer.timestamps.initiated) / 1000;
    }
    return (Date.now() - transfer.timestamps.initiated) / 1000;
  }

  _calculateProgress(transfer) {
    const stages = ['burn', 'attestation', 'mint'];
    let completed = 0;
    for (const stage of stages) {
      if (transfer.stages[stage].status === 'complete') completed++;
    }
    return ((completed / stages.length) * 100).toFixed(0);
  }

  _archiveTransfer(transfer) {
    this.statusHistory.unshift(transfer);
    if (this.statusHistory.length > this.maxHistorySize) {
      this.statusHistory.pop();
    }
    setTimeout(() => {
      this.transfers.delete(transfer.txHash);
    }, 60000);
  }
}