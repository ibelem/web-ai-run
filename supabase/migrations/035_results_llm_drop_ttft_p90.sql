-- Drop ttft_p90_ms from results_llm: P90 was an unusual metric inconsistently
-- exposed across the user-facing and admin pages. We keep only TTFT avg/stddev,
-- which match the rest of the LLM benchmark surface (TPS, E2E, Compile, etc.).
ALTER TABLE results_llm DROP COLUMN IF EXISTS ttft_p90_ms;
