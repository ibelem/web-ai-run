import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// /llm has no landing of its own (yet) — bounce to the recipe browser, which is
// the natural entry point for the LLM flow.
export const load: PageLoad = () => {
  throw redirect(308, '/llm/recipe');
};
