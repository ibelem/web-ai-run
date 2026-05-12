export type TestType = 'model' | 'recipe' | 'custom';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function canRunBenchmark(isAuthenticated: boolean, testType: TestType): GuardResult {
  if (testType === 'model') {
    return { allowed: true };
  }
  if (isAuthenticated) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Running recipe and custom tests requires a free account. Sign in to continue.'
  };
}
