// src/services/RouteOptimizerV2.js (new file)
import { RouteOptimizer } from './RouteOptimizer.js';
import { scoreRoute, scoreMany } from '../advanced/router/scorer.js';
import { generateCanonicalPlan } from '../advanced/router/planner.js';

export class RouteOptimizerV2 extends RouteOptimizer {
  constructor(lpMonitor) {
    super(lpMonitor);
    this.useAdvancedScoring = true;
  }

  // Override with your advanced scoring
  async findOptimalRoute(options) {
    // Get basic routes from parent
    const basicRoutes = await super.findOptimalRoute(options);
    
    if (!this.useAdvancedScoring) {
      return basicRoutes;
    }

    // Apply your advanced scoring
    const scored = scoreMany([basicRoutes]);
    const best = scored[0];

    // Generate canonical plan with hash
    const plan = generateCanonicalPlan(best.route, {
      requestId: options.requestId,
      userAddress: options.userAddress
    });

    return {
      ...best.route,
      advancedScore: best.score,
      plan: plan.plan,
      planHash: plan.hash
    };
  }
}