# HuggingFace Mirror (hf-mirror.com) — API Compatibility Research

**Date:** 2026-05-22

## Summary

`hf-mirror.com` is **not a viable substitute** for the HuggingFace API. All API endpoints return HTTP 308 permanent redirects to `huggingface.co`. The mirror only serves model file downloads.

## Endpoints Tested

The app makes three types of API calls:

| Endpoint | Example URL | hf-mirror.com result |
|---|---|---|
| Search repos | `/api/models?search=mobilenet&limit=20&skip=0` | 308 → huggingface.co |
| Repo file tree | `/api/models/{id}/tree/main?recursive=true` | 308 → huggingface.co |
| Repo metadata | `/api/models/{id}` | 308 → huggingface.co |

## Conclusion

Browsers following the 308 redirect end up hitting `huggingface.co` directly. Swapping `HF_API` to `https://hf-mirror.com/api` would have no effect — traffic still goes to the origin.

## Options for Users Who Cannot Reach HuggingFace

1. **Server-side proxy** — a backend route (`/api/hf-proxy`) that forwards API calls from the server, bypassing client-side restrictions. The app already has a Supabase backend; an edge function could handle this.

2. **Split strategy** — keep API calls (`/api/models/...`) pointing to `huggingface.co`, but rewrite model download URLs to `https://hf-mirror.com/{org}/{repo}/resolve/main/{path}`. The mirror does serve file downloads correctly. This helps with download speed in China without requiring a full proxy.

3. **Do nothing** — the current user base may not require this. Revisit when there is evidence of demand.
