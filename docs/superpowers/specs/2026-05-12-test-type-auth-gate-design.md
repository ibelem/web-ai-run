# Role-Based Test Type Gate

Status: APPROVED
Date: 2026-05-12
Branch: plan

## Problem

We need to gate access to certain test types behind authentication. Anonymous users should be able to run single model tests to get a taste of the benchmark, but recipe tests (curated multi-model selections) and custom tests (user-configured) require a free account.

## Decision

Simple role-based gate on test type. No GPU detection, no hardware checks.

| Test Type | Anonymous | Member+ |
|-----------|-----------|---------|
| /model    | Y         | Y       |
| /recipe   | -         | Y       |
| /custom   | -         | Y       |

## Components

### 1. Benchmark Guard

**Path:** `src/lib/guards/benchmark-guard.ts`

```typescript
type TestType = 'model' | 'recipe' | 'custom';

interface GuardResult {
  allowed: boolean;
  reason?: string;
}

function canRunBenchmark(isAuthenticated: boolean, testType: TestType): GuardResult {
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
```

### 2. Sign-In Modal

Triggered when `canRunBenchmark` returns `{ allowed: false }`.

- Uses the design system Confirmation Dialog component
- Title: "Sign in to continue"
- Body: guard result's `reason` string
- Primary actions: "Sign in with GitHub", "Sign in with Google"
- Secondary action: "Cancel"
- On successful auth: re-check guard and auto-proceed with benchmark

## Integration Points

The guard is called when the user clicks "Run":
- `/recipe` page: always gated for anonymous users
- `/custom` page: always gated for anonymous users
- `/model` page: never gated (anonymous can run)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Anonymous clicks Run on /model | Allowed, runs immediately |
| Anonymous clicks Run on /recipe | Modal: sign in required |
| Anonymous clicks Run on /custom | Modal: sign in required |
| Signed-in user on any page | Allowed, runs immediately |
| Session expires mid-use | Next Run click shows sign-in modal |

## Permission Matrix Update

| Feature | Anonymous | Member | Partner | Intel | Admin |
|---------|-----------|--------|---------|-------|-------|
| Run /model tests | Y | Y | Y | Y | Y |
| Run /recipe tests | - | Y | Y | Y | Y |
| Run /custom tests | - | Y | Y | Y | Y |

## What This Replaces

This replaces the GPU-based auth gate design. No WebGL detection, no vendor checking, no hardware-specific logic. Simpler, no edge cases around privacy settings or dual GPUs.
