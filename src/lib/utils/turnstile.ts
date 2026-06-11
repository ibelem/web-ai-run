// Cloudflare Turnstile loader. Used by the shared TurnstileWidget component.
// The script is loaded once per page (ID-checked) and exposes window.turnstile.

const SCRIPT_ID = 'cf-turnstile-script';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileRenderOptions {
  sitekey: string;
  size?: 'normal' | 'compact' | 'flexible';
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

export interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function loadTurnstileScript(onReady: () => void): void {
  if (typeof document === 'undefined') return;
  if (window.turnstile) {
    onReady();
    return;
  }
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (window.turnstile) onReady();
    else existing.addEventListener('load', () => onReady(), { once: true });
    return;
  }
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.src = SRC;
  s.async = true;
  s.defer = true;
  s.crossOrigin = 'anonymous';
  s.onload = () => onReady();
  document.head.appendChild(s);
}
