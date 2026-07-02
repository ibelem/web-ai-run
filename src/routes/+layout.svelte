<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { initTheme, toggleTheme, theme } from '$lib/stores/theme';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { cart, cartCount } from '$lib/stores/cart';
  import { cartPanelOpen } from '$lib/stores/cart-panel';
  import CartPanel from '$lib/components/CartPanel.svelte';
  import NavDropdown, { type NavGroup } from '$lib/components/NavDropdown.svelte';
  import { createClient } from '$lib/supabase/client';
  import { env } from '$env/dynamic/public';
  import { isAtLeast, type Role } from '$lib/types/roles';
  import { gravatarUrl } from '$lib/utils/gravatar';
  import { clearModelCache } from '$lib/engine/model-cache';
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
  import SupportWidget from '$lib/components/support/SupportWidget.svelte';
  import { initSupport, teardownSupport } from '$lib/stores/support';

  let { data, children } = $props();
  let cacheClearState = $state<'idle' | 'done'>('idle');
  let gravatarFailed = $state(false);
  let isCrossOriginIsolated = $state(false);
  let isJspiSupported = $state(false);
  let isWebnnAvailable = $state(false);
  let interruptedRun = $state<{ kind: 'inference' | 'llm'; pending: number; completed: number; total: number } | null>(null);

  // Clear interrupted banner when a run finishes
  $effect(() => {
    if (!$isRunningStore && browser) {
      const inf = localStorage.getItem('interrupted_run');
      const llm = localStorage.getItem('interrupted_llm_run');
      if (!inf && !llm) interruptedRun = null;
    }
  });

  const supabase = createClient();

  function checkInterruptedRun() {
    // /run state takes priority if both exist (older flow, more likely to be the active one)
    try {
      const raw = localStorage.getItem('interrupted_run');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.queue && Array.isArray(saved.queue)) {
          if (saved.ts && Date.now() - saved.ts > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('interrupted_run');
          } else {
            const pending = saved.queue.filter((i: any) => i.status === 'pending' || i.status === 'downloading' || i.status === 'compiling' || i.status === 'running').length;
            const completed = saved.queue.filter((i: any) => i.status === 'completed').length;
            if (pending > 0) {
              interruptedRun = { kind: 'inference', pending, completed, total: saved.queue.length };
              return;
            }
            localStorage.removeItem('interrupted_run');
          }
        }
      }
    } catch {
      localStorage.removeItem('interrupted_run');
    }

    try {
      const raw = localStorage.getItem('interrupted_llm_run');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.state || !Array.isArray(saved.state)) return;
      if (saved.ts && Date.now() - saved.ts > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('interrupted_llm_run');
        return;
      }
      const pending = saved.state.filter((s: any) => s.status === 'pending').length;
      const completed = saved.state.filter((s: any) => s.status === 'completed').length;
      if (pending > 0) {
        interruptedRun = { kind: 'llm', pending, completed, total: saved.state.length };
      } else {
        localStorage.removeItem('interrupted_llm_run');
      }
    } catch {
      localStorage.removeItem('interrupted_llm_run');
    }
  }

  function dismissInterruptedRun() {
    localStorage.removeItem('interrupted_run');
    localStorage.removeItem('interrupted_llm_run');
    interruptedRun = null;
  }

  function resumeInterruptedRun() {
    if (!interruptedRun) return;
    window.location.href = interruptedRun.kind === 'llm' ? '/llm/run#resume=1' : '/inference/run#resume=1';
  }

  onMount(() => {
    initTheme();
    cart.init();

    if (browser) {
      isCrossOriginIsolated = window.crossOriginIsolated ?? false;
      try {
        new (WebAssembly as any).Suspending(() => {});
        isJspiSupported = true;
      } catch {
        isJspiSupported = false;
      }
      isWebnnAvailable = typeof (navigator as any).ml !== 'undefined';
      checkInterruptedRun();
    }

    // DEV-only: force a role via PUBLIC_DEV_ROLE (in .env.local) to test
    // role-gated UI (e.g. the custom-ORT dropdown) without logging in —
    // bypasses Turnstile/Supabase entirely. `import.meta.env.DEV` makes Vite
    // strip this whole branch from production builds, so it can never ship.
    const devRole: Role | '' = import.meta.env.DEV
      ? ((env.PUBLIC_DEV_ROLE ?? '') as Role | '')
      : '';
    const role: Role = data.session?.user?.app_metadata?.role ?? 'anonymous';
    auth.set({
      session: data.session,
      user: data.session?.user ?? null,
      role: devRole || (data.session ? role : 'anonymous'),
      loading: false
    });

    if (data.session?.user) {
      initSupport(data.session.user.id, role === 'admin');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      const newRole: Role = session?.user?.app_metadata?.role ?? 'anonymous';
      auth.set({
        session,
        user: session?.user ?? null,
        role: session ? newRole : 'anonymous',
        loading: false
      });
      // Keep the support channel in sync with auth changes that happen
      // after initial load (login/logout don't remount the layout).
      teardownSupport();
      if (session?.user) {
        initSupport(session.user.id, newRole === 'admin');
      }
      invalidateAll();
    });

    return () => {
      subscription.unsubscribe();
      teardownSupport();
    };
  });

  async function signIn(provider: 'github' | 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  let showUserMenu = $state(false);
  let showMobileMenu = $state(false);
  let openMobileSection = $state<string | null>(null);

  function closeMobileMenu() {
    showMobileMenu = false;
    openMobileSection = null;
  }

  function toggleMobileSection(name: string) {
    openMobileSection = openMobileSection === name ? null : name;
  }

  const showLeaderboard = $derived(isAtLeast($auth.role ?? 'anonymous', 'partner'));
  const isAdmin = $derived($auth.role === 'admin');

  // ── Nav structure (single source of truth for desktop popovers + mobile accordion) ──
  const inferenceGroups: NavGroup[] = [
    { links: [{ href: '/inference',        label: 'Search', title: 'Search Hugging Face for an ONNX or LiteRT model and queue files into the cart.' }] },
    { links: [{ href: '/inference/browse', label: 'Browse', title: 'Browse the curated catalog of ready-to-benchmark inference models.' }] },
    { links: [{ href: '/inference/recipe', label: 'Recipe', title: 'Browse, create, or import inference benchmark recipes.' }] },
    { links: [{ href: '/inference/custom', label: 'Custom', title: 'Drag and drop your own .onnx or .tflite file (plus sidecars) to benchmark it locally.' }] },
    { links: [{ href: '/inference/overrides', label: 'Shapes',  title: 'Free Dimension Overrides — set values for symbolic dimensions (batch_size, seq_length, etc.) so models with dynamic axes can compile on backends that need static shapes.' }] },
    { links: [{ href: '/inference/results',   label: 'Results', title: 'Inference benchmark results — TTFT, latency, throughput across runs.' }] },
  ];

  const llmGroups: NavGroup[] = [
    { links: [{ href: '/llm/recipe',  label: 'Recipe',  title: 'Browse, create, or import LLM benchmark recipes.' }] },
    { links: [{ href: '/llm/custom',  label: 'Custom',  title: 'Drop your own ONNX LLM bundle (config + tokenizer + weights) to benchmark it locally.' }] },
    { links: [{ href: '/llm/results', label: 'Results', title: 'LLM benchmark results — Prompt/Output tokens, TTFT, TPS, TPOT, E2E.' }] },
  ];

  const leaderboardGroups: NavGroup[] = [
    { links: [{ href: '/inference/leaderboard', label: 'Inference · Compare', title: 'Compare inference benchmark results across any axis (WebNN EP, version, backend, hardware, browser, etc.).' }] },
    { links: [{ href: '/inference/trend',       label: 'Inference · Trends', title: 'Plot inference performance trends over time or across versions/iterations, one line per compared axis value.' }] },
    { links: [{ href: '/llm/leaderboard',       label: 'LLM · Compare',      title: 'Compare LLM benchmark results across any axis (runtime version, backend, hardware, browser, etc.).' }] },
    { links: [{ href: '/llm/trend',             label: 'LLM · Trends',       title: 'Plot LLM performance trends over time or across versions/token counts, one line per compared axis value.' }] },
  ];

  const adminGroups: NavGroup[] = [
    { links: [{ href: '/admin/users',              label: 'Users',           title: 'Admin: manage user accounts, roles, and access.' }] },
    { links: [{ href: '/admin/orgs',               label: 'Orgs',            title: 'Admin: manage organizations and partner accounts.' }] },
    { links: [{ href: '/admin/models',             label: 'Models',          title: 'Admin: curated model catalog.' }] },
    { links: [{ href: '/admin/inference/recipes',  label: 'Recipes · Inference', title: 'Admin: feature, order, and audit inference recipes.' }] },
    { links: [{ href: '/admin/llm/recipes',        label: 'Recipes · LLM',       title: 'Admin: feature, order, and audit LLM recipes.' }] },
    { links: [{ href: '/admin/inference/results',  label: 'Results · Inference', title: 'Admin: all inference benchmark results across users.' }] },
    { links: [{ href: '/admin/llm/results',        label: 'Results · LLM',       title: 'Admin: all LLM benchmark results across users.' }] },
    { links: [{ href: '/admin/support',            label: 'Support',             title: 'Admin: all user support conversations.' }] },
  ];

  // Active-state checks for triggers. Leaderboard wins over its parent domain so the
  // dropdown lights up correctly when the user is on /inference/leaderboard or
  // /llm/leaderboard. Cast to string because SvelteKit's pathname union only includes
  // routes that actually exist as +page.svelte; we still want prefix matching.
  const path = $derived($page.url.pathname as string);
  const leaderboardActive = $derived(
    path === '/inference/leaderboard' ||
    path.startsWith('/inference/leaderboard/') ||
    path === '/llm/leaderboard' ||
    path.startsWith('/llm/leaderboard/') ||
    path === '/inference/trend' ||
    path.startsWith('/inference/trend/') ||
    path === '/llm/trend' ||
    path.startsWith('/llm/trend/')
  );
  const inferenceActive = $derived(
    !leaderboardActive && (path === '/inference' || path.startsWith('/inference/'))
  );
  const llmActive = $derived(
    !leaderboardActive && (path === '/llm' || path.startsWith('/llm/'))
  );
  const adminActive = $derived(path.startsWith('/admin'));
</script>

<a href="#main-content" class="skip-link">Skip to main content</a>
<nav class="top-bar" class:hidden={$isRunningStore}>
  <div class="nav-left">
    <a href="/" class="logo" aria-label="Web AI Benchmark home">
      <svg class="logo-icon" height="32" viewBox="0 0 642 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 80L33 59" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M63 73L44 58" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M77 75L103 69" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M126 30L119 53" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M151 55L127 61" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M161 64L156 99" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M163 52L193 97" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M162 106L188 106" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M148 112L119 133" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M101 104L155 146" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M183 140L155 146" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M194 131L197 119" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M195 145L203 156" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M123 74L149 101" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M67 85L55 117" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M27 86L87 102" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M79 50L97 93" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <path d="M120 25L88 35" stroke="none" stroke-width="6" stroke-linecap="round"/>
        <circle cx="38.5" cy="52.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="69.5" cy="77.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="127.5" cy="22.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="154.5" cy="106.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="112.5" cy="138.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="190.5" cy="138.5" r="6.5" stroke="none" stroke-width="4"/>
        <circle cx="200" cy="107" r="10" stroke="none" stroke-width="6"/>
        <circle cx="115" cy="65" r="10" stroke="none" stroke-width="6"/>
        <circle class="logo_cicle" cx="15" cy="82" r="12" fill="white" stroke="none" stroke-width="6"/>
        <circle class="logo_cicle"  cx="75" cy="39" r="12" fill="white" stroke="none" stroke-width="6"/>
        <circle class="logo_cicle" cx="163" cy="52" r="12" fill="white" stroke="none" stroke-width="6"/>
        <circle class="logo_cicle" cx="101" cy="104" r="12" fill="white" stroke="none" stroke-width="6"/>
        <circle class="logo_cicle" cx="156" cy="145" r="12" fill="white" stroke="none" stroke-width="6"/>
        <path d="M389.525 77L392.6 22.25H400.475L397.7 60.5C397.65 61.35 397.575 62.4 397.475 63.65C397.375 64.85 397.25 66.075 397.1 67.325C396.95 68.575 396.825 69.675 396.725 70.625C396.975 69.675 397.225 68.575 397.475 67.325C397.775 66.075 398.075 64.85 398.375 63.65C398.725 62.4 399.025 61.35 399.275 60.5L409.85 22.25H417.95L416.075 60.5C416.025 61.35 415.975 62.4 415.925 63.65C415.875 64.85 415.825 66.075 415.775 67.325C415.725 68.575 415.675 69.675 415.625 70.625C415.825 69.675 416.05 68.575 416.3 67.325C416.55 66.075 416.8 64.85 417.05 63.65C417.35 62.4 417.6 61.35 417.8 60.5L427.175 22.25H435.2L420.575 77H410.225L412.175 38.6C412.225 37.65 412.3 36.55 412.4 35.3C412.5 34 412.6 32.725 412.7 31.475C412.8 30.175 412.875 29.075 412.925 28.175C412.725 29.075 412.475 30.175 412.175 31.475C411.875 32.725 411.575 34 411.275 35.3C410.975 36.55 410.7 37.65 410.45 38.6L399.95 77H389.525ZM450.096 77.75C446.596 77.75 443.671 77.075 441.321 75.725C438.971 74.375 437.271 72.5 436.221 70.1C435.221 67.65 434.971 64.8 435.471 61.55L437.121 51.2C437.671 47.95 438.846 45.125 440.646 42.725C442.446 40.275 444.721 38.375 447.471 37.025C450.271 35.675 453.421 35 456.921 35C460.371 35 463.271 35.675 465.621 37.025C467.971 38.375 469.646 40.275 470.646 42.725C471.696 45.125 471.946 47.95 471.396 51.2L470.196 58.625H444.996L444.471 61.55C444.071 64.45 444.421 66.65 445.521 68.15C446.671 69.6 448.621 70.325 451.371 70.325C453.471 70.325 455.196 69.975 456.546 69.275C457.946 68.525 458.921 67.45 459.471 66.05H468.771C467.921 68.4 466.571 70.45 464.721 72.2C462.921 73.95 460.771 75.325 458.271 76.325C455.771 77.275 453.046 77.75 450.096 77.75ZM462.021 53.375L462.396 51.125C462.846 48.275 462.521 46.1 461.421 44.6C460.321 43.05 458.421 42.275 455.721 42.275C453.021 42.275 450.846 43.05 449.196 44.6C447.596 46.15 446.571 48.35 446.121 51.2L445.896 52.775L462.846 52.625L462.021 53.375ZM498.516 77.75C495.116 77.75 492.566 76.8 490.866 74.9C489.216 72.95 488.641 70.3 489.141 66.95L490.941 69.125H488.841L487.566 77H478.416L487.116 22.25H496.491L494.616 33.8L492.741 43.625H494.916L492.516 45.8C493.016 42.45 494.416 39.825 496.716 37.925C499.066 35.975 501.941 35 505.341 35C509.491 35 512.566 36.425 514.566 39.275C516.566 42.125 517.191 45.975 516.441 50.825L514.641 62C514.141 65.2 513.141 68 511.641 70.4C510.141 72.75 508.266 74.575 506.016 75.875C503.766 77.125 501.266 77.75 498.516 77.75ZM496.491 69.65C498.891 69.65 500.866 68.95 502.416 67.55C503.966 66.15 504.941 64.15 505.341 61.55L506.991 51.2C507.391 48.6 507.041 46.6 505.941 45.2C504.841 43.8 503.091 43.1 500.691 43.1C498.341 43.1 496.391 43.825 494.841 45.275C493.291 46.675 492.291 48.65 491.841 51.2L490.191 61.55C489.791 64.1 490.141 66.1 491.241 67.55C492.391 68.95 494.141 69.65 496.491 69.65ZM541.823 77L564.323 22.25H576.398L581.573 77H572.273L571.373 63.725H556.823L551.723 77H541.823ZM559.673 56.075H570.848L569.873 41.375C569.723 38.925 569.573 36.725 569.423 34.775C569.323 32.775 569.273 31.325 569.273 30.425C568.973 31.325 568.473 32.775 567.773 34.775C567.123 36.725 566.348 38.9 565.448 41.3L559.673 56.075ZM590.919 77L592.269 68.75H603.294L609.294 30.5H598.344L599.619 22.25H631.119L629.769 30.5H618.744L612.744 68.75H623.694L622.419 77H590.919Z" fill="none"/>
        <path d="M230.475 158L239.175 103.25H255.975C261.275 103.25 265.275 104.525 267.975 107.075C270.675 109.575 271.675 113 270.975 117.35C270.625 119.8 269.75 121.925 268.35 123.725C266.95 125.525 265.225 126.925 263.175 127.925C261.125 128.925 258.9 129.425 256.5 129.425V129.125C259.15 129.075 261.425 129.575 263.325 130.625C265.225 131.625 266.625 133.125 267.525 135.125C268.475 137.125 268.7 139.55 268.2 142.4C267.7 145.55 266.55 148.3 264.75 150.65C262.95 153 260.625 154.825 257.775 156.125C254.975 157.375 251.75 158 248.1 158H230.475ZM240.825 150.2H248.775C251.525 150.2 253.8 149.475 255.6 148.025C257.4 146.525 258.5 144.5 258.9 141.95C259.3 139.4 258.825 137.35 257.475 135.8C256.175 134.2 254.15 133.4 251.4 133.4H243.45L240.825 150.2ZM244.65 125.825H252.225C254.725 125.825 256.775 125.175 258.375 123.875C260.025 122.525 261.05 120.7 261.45 118.4C261.8 116.1 261.35 114.3 260.1 113C258.9 111.7 257.05 111.05 254.55 111.05H246.975L244.65 125.825ZM292.096 158.75C288.596 158.75 285.671 158.075 283.321 156.725C280.971 155.375 279.271 153.5 278.221 151.1C277.221 148.65 276.971 145.8 277.471 142.55L279.121 132.2C279.671 128.95 280.846 126.125 282.646 123.725C284.446 121.275 286.721 119.375 289.471 118.025C292.271 116.675 295.421 116 298.921 116C302.371 116 305.271 116.675 307.621 118.025C309.971 119.375 311.646 121.275 312.646 123.725C313.696 126.125 313.946 128.95 313.396 132.2L312.196 139.625H286.996L286.471 142.55C286.071 145.45 286.421 147.65 287.521 149.15C288.671 150.6 290.621 151.325 293.371 151.325C295.471 151.325 297.196 150.975 298.546 150.275C299.946 149.525 300.921 148.45 301.471 147.05H310.771C309.921 149.4 308.571 151.45 306.721 153.2C304.921 154.95 302.771 156.325 300.271 157.325C297.771 158.275 295.046 158.75 292.096 158.75ZM304.021 134.375L304.396 132.125C304.846 129.275 304.521 127.1 303.421 125.6C302.321 124.05 300.421 123.275 297.721 123.275C295.021 123.275 292.846 124.05 291.196 125.6C289.596 127.15 288.571 129.35 288.121 132.2L287.896 133.775L304.846 133.625L304.021 134.375ZM320.416 158L326.941 116.75H336.091L334.816 124.625H337.366L334.516 126.8C335.066 123.4 336.466 120.75 338.716 118.85C341.016 116.95 343.891 116 347.341 116C351.391 116 354.416 117.35 356.416 120.05C358.416 122.75 359.041 126.375 358.291 130.925L354.016 158H344.641L348.766 131.9C349.166 129.4 348.816 127.475 347.716 126.125C346.616 124.775 344.916 124.1 342.616 124.1C340.266 124.1 338.316 124.8 336.766 126.2C335.266 127.6 334.291 129.6 333.841 132.2L329.791 158H320.416ZM382.187 158.75C378.687 158.75 375.737 158.1 373.337 156.8C370.937 155.45 369.212 153.575 368.162 151.175C367.162 148.725 366.912 145.85 367.412 142.55L369.062 132.2C369.612 128.85 370.787 125.975 372.587 123.575C374.387 121.175 376.687 119.325 379.487 118.025C382.337 116.675 385.512 116 389.012 116C394.212 116 398.137 117.35 400.787 120.05C403.487 122.7 404.562 126.325 404.012 130.925H394.637C394.787 128.775 394.262 127.125 393.062 125.975C391.862 124.775 390.087 124.175 387.737 124.175C385.187 124.175 383.112 124.875 381.512 126.275C379.912 127.625 378.912 129.575 378.512 132.125L376.787 142.55C376.387 145.1 376.762 147.075 377.912 148.475C379.112 149.875 380.987 150.575 383.537 150.575C385.887 150.575 387.837 150 389.387 148.85C390.987 147.65 392.037 145.975 392.537 143.825H401.987C401.037 148.425 398.787 152.075 395.237 154.775C391.737 157.425 387.387 158.75 382.187 158.75ZM410.358 158L419.058 103.25H428.433L426.258 116.75L424.758 124.625H427.308L424.458 126.8C425.008 123.4 426.408 120.75 428.658 118.85C430.958 116.95 433.833 116 437.283 116C441.333 116 444.358 117.35 446.358 120.05C448.358 122.75 448.983 126.375 448.233 130.925L443.958 158H434.583L438.708 131.9C439.108 129.4 438.758 127.475 437.658 126.125C436.558 124.775 434.858 124.1 432.558 124.1C430.208 124.1 428.258 124.8 426.708 126.2C425.208 127.6 424.233 129.6 423.783 132.2L419.733 158H410.358ZM453.454 158L459.979 116.75H467.629L466.729 122.3H468.379L466.879 123.65C467.279 121.35 468.229 119.5 469.729 118.1C471.229 116.7 473.004 116 475.054 116C477.254 116 478.829 116.9 479.779 118.7C480.729 120.5 480.954 122.925 480.454 125.975L479.404 122.3H481.954L480.754 123.65C481.154 121.35 482.104 119.5 483.604 118.1C485.104 116.7 486.929 116 489.079 116C491.629 116 493.504 116.95 494.704 118.85C495.904 120.75 496.229 123.325 495.679 126.575L490.729 158H482.479L487.354 126.95C487.604 125.6 487.479 124.55 486.979 123.8C486.529 123 485.729 122.6 484.579 122.6C483.479 122.6 482.554 122.975 481.804 123.725C481.104 124.475 480.629 125.55 480.379 126.95L475.429 158H468.679L473.629 126.95C473.829 125.55 473.679 124.475 473.179 123.725C472.729 122.975 471.929 122.6 470.779 122.6C469.629 122.6 468.704 122.975 468.004 123.725C467.304 124.475 466.854 125.55 466.654 126.95L461.704 158H453.454ZM513.424 158.75C509.274 158.75 506.174 157.325 504.124 154.475C502.124 151.625 501.524 147.8 502.324 143L504.049 131.825C504.599 128.575 505.624 125.775 507.124 123.425C508.624 121.075 510.499 119.25 512.749 117.95C514.999 116.65 517.499 116 520.249 116C523.649 116 526.174 116.975 527.824 118.925C529.524 120.825 530.099 123.45 529.549 126.8L527.824 124.625H529.924L530.974 116.75H540.349L533.824 158H524.599L525.874 150.125H523.849L526.249 147.95C525.699 151.3 524.274 153.95 521.974 155.9C519.674 157.8 516.824 158.75 513.424 158.75ZM518.074 150.65C520.424 150.65 522.374 149.95 523.924 148.55C525.474 147.1 526.449 145.1 526.849 142.55L528.499 132.2C528.949 129.65 528.599 127.675 527.449 126.275C526.299 124.825 524.549 124.1 522.199 124.1C519.799 124.1 517.824 124.8 516.274 126.2C514.774 127.6 513.824 129.6 513.424 132.2L511.774 142.55C511.324 145.15 511.649 147.15 512.749 148.55C513.849 149.95 515.624 150.65 518.074 150.65ZM546.545 158L553.07 116.75H561.92L560.645 124.625H562.97L559.445 129.425C560.145 124.975 561.67 121.625 564.02 119.375C566.42 117.125 569.57 116 573.47 116C577.92 116 581.195 117.375 583.295 120.125C585.395 122.875 586.07 126.675 585.32 131.525L584.795 134.525H574.97L575.42 132.2C575.82 129.55 575.445 127.5 574.295 126.05C573.195 124.6 571.445 123.875 569.045 123.875C566.595 123.875 564.57 124.6 562.97 126.05C561.42 127.5 560.445 129.55 560.045 132.2L555.92 158H546.545ZM590.466 158L599.166 103.25H608.541L603.816 132.95H609.816L622.416 116.75H633.141L617.466 137.075L626.841 158H616.491L609.066 140.9H602.541L599.841 158H590.466Z" fill="none"/>
        <path d="M301 24H413" stroke="none" stroke-width="3" stroke-linecap="round"/>
        <path d="M340 37H398" stroke="none" stroke-width="3" stroke-linecap="round"/>
        <path d="M248 50H396" stroke="none" stroke-width="3" stroke-linecap="round"/>
        <path d="M295 63H395" stroke="none" stroke-width="3" stroke-linecap="round"/>
        <path d="M334 75H390" stroke="none" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </a>
    <div class="nav-links">
      <NavDropdown label="Inference" isActive={inferenceActive} groups={inferenceGroups} />
      <NavDropdown label="LLM"        isActive={llmActive}       groups={llmGroups} />
      {#if showLeaderboard}
        <NavDropdown label="Leaderboard" isActive={leaderboardActive} groups={leaderboardGroups} />
      {/if}
      {#if isAdmin}
        <NavDropdown label="Admin" isActive={adminActive} groups={adminGroups} />
      {/if}
    </div>
  </div>
  <div class="nav-right">
    {#if $cartCount > 0}
      <button
        class="nav-item nav-cart"
        onclick={() => cartPanelOpen.set(true)}
      >
        Cart
        <span class="nav-cart-badge">{$cartCount}</span>
      </button>
    {/if}
    <button class="nav-item theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
      {#if $theme === 'light'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      {/if}
    </button>
    {#if $isAuthenticated}
      <div class="user-menu-wrapper">
        <button
          class="user-trigger"
          onclick={() => showUserMenu = !showUserMenu}
          aria-expanded={showUserMenu}
          aria-label="User menu"
          aria-haspopup="menu"
        >
          {#if data.profileAvatarUrl}
            <img
              src={data.profileAvatarUrl}
              alt="Avatar"
              class="nav-avatar"
              loading="lazy"
              crossorigin="anonymous"
            />
          {:else if data.session?.user?.user_metadata?.avatar_url || data.session?.user?.user_metadata?.picture}
            <img
              src={data.session.user.user_metadata.avatar_url ?? data.session.user.user_metadata.picture}
              alt="Avatar"
              class="nav-avatar"
              loading="lazy"
              crossorigin="anonymous"
            />
          {:else if data.session?.user?.email && !gravatarFailed}
            <img
              src={gravatarUrl(data.session.user.email, 60)}
              alt="Avatar"
              class="nav-avatar"
              loading="lazy"
              crossorigin="anonymous"
              onerror={() => { gravatarFailed = true; }}
            />
          {:else}
            <span class="nav-avatar-placeholder">
              {data.session?.user?.user_metadata?.full_name?.[0]?.toUpperCase() ?? data.session?.user?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          {/if}
        </button>
        {#if showUserMenu}
          <div class="user-dropdown">
            <a href="/account" class="dropdown-item" onclick={() => showUserMenu = false}>Account</a>
            <button class="dropdown-item" onclick={() => { showUserMenu = false; signOut(); }}>
              Sign out
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <a href="/login" class="nav-item">Sign in</a>
    {/if}
    <button
      class="hamburger"
      onclick={() => showMobileMenu = !showMobileMenu}
      aria-label="Toggle menu"
      aria-expanded={showMobileMenu}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </div>
</nav>

{#snippet mobileSection(name: string, label: string, isActive: boolean, groups: NavGroup[])}
  <button
    class="mobile-section-header"
    class:active={isActive}
    onclick={() => toggleMobileSection(name)}
    aria-expanded={openMobileSection === name}
  >
    {label}
    <svg class="admin-chevron" class:open={openMobileSection === name} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>
  {#if openMobileSection === name}
    <div class="mobile-section-body">
      {#each groups as group}
        {#if group.label}
          <div class="mobile-group-label">{group.label}</div>
        {/if}
        {#each group.links as link}
          <a href={link.href} class="mobile-link" class:active={$page.url.pathname === link.href || (link.href !== '/' && $page.url.pathname.startsWith(link.href + '/'))} onclick={closeMobileMenu} title={link.title}>{link.label}</a>
        {/each}
      {/each}
    </div>
  {/if}
{/snippet}

{#if showMobileMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="mobile-overlay" onclick={closeMobileMenu} onkeydown={() => {}}></div>
  <div class="mobile-menu">
    {@render mobileSection('inference', 'Inference', inferenceActive, inferenceGroups)}
    {@render mobileSection('llm', 'LLM', llmActive, llmGroups)}
    {#if showLeaderboard}
      {@render mobileSection('leaderboard', 'Leaderboard', leaderboardActive, leaderboardGroups)}
    {/if}
    {#if isAdmin}
      {@render mobileSection('admin', 'Admin', adminActive, adminGroups)}
    {/if}
  </div>
{/if}

{#if interruptedRun && !$isRunningStore}
  <div class="interrupted-banner">
    <span class="interrupted-text">
      A previous benchmark run was interrupted ({interruptedRun.completed}/{interruptedRun.total} completed, {interruptedRun.pending} remaining).
    </span>
    <button class="interrupted-btn interrupted-resume" onclick={resumeInterruptedRun}>Resume</button>
    <button class="interrupted-btn interrupted-dismiss" onclick={dismissInterruptedRun}>Dismiss</button>
  </div>
{/if}

<main id="main-content">
  {@render children()}
</main>

<CartPanel
  open={$cartPanelOpen}
  onclose={() => cartPanelOpen.set(false)}
  ondeselect={(id) => cart.removeById(id)}
  ondeselecthf={(hf_model_id, file_path) => cart.remove(hf_model_id, file_path)}
/>

{#if $isAuthenticated && !$isRunningStore}
  <SupportWidget />
{/if}


<footer class="site-footer" class:hidden={$isRunningStore}>
  <div class="footer-caps">
    <span class="footer-cap webnn" class:cap-ok={isWebnnAvailable} class:cap-warn={!isWebnnAvailable}
      title="WebNN API availability - navigator.ml must be defined">
      {#if isWebnnAvailable}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M420-340h120v-100h100v-120H540v-100H420v100H320v120h100v100Zm60 260q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/></svg>
        WebNN Available
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z"/></svg>
        WebNN Unavailable
      {/if}
    </span>
    <span class="footer-cap cross-origin" class:cap-ok={isCrossOriginIsolated} class:cap-warn={!isCrossOriginIsolated}
      title="Cross Origin Isolated enables SharedArrayBuffer for multi-thread testing (COOP + COEP headers required)">
      {#if isCrossOriginIsolated}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M420-340h120v-100h100v-120H540v-100H420v100H320v120h100v100Zm60 260q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/></svg>
        Cross Origin Isolated
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z"/></svg>
        Cross Origin Not Isolated
      {/if}
    </span>
    <span class="footer-cap jspi" class:cap-ok={isJspiSupported} class:cap-warn={!isJspiSupported}
      title="JSPI (WebAssembly Promise Integration) is required for WebNN and WebGPU with LiteRT.js. Enable #enable-experimental-webassembly-features in chrome://flags">
      {#if isJspiSupported}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M420-340h120v-100h100v-120H540v-100H420v100H320v120h100v100Zm60 260q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/></svg>
        JSPI Enabled
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z"/></svg>
        JSPI Disabled
      {/if}
    </span>
    <button
      class="footer-cap footer-clear-cache"
      title="Clear locally cached model files (OPFS / Cache API). Models will re-download on the next run."
      onclick={async () => {
        await clearModelCache();
        cacheClearState = 'done';
        setTimeout(() => { cacheClearState = 'idle'; }, 2000);
      }}
    >
      {#if cacheClearState === 'done'}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
        Cache Cleared
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
        Clear Model Cache
      {/if}
    </button>
  </div>
  <div class="footer-brand">
    <span class="footer-copy">&copy; {new Date().getFullYear()} <a href="https://webai.run">Web AI Benchmark</a></span>
    <span class="footer-sep">·</span>
    <a class="footer-link" href="/privacy">Privacy</a>
    <span class="footer-sep">·</span>
    <a class="footer-link" href="/terms">Terms</a>
    <span class="footer-sep">·</span>
    <a class="footer-link" href="/faq">FAQ</a>
    {#if $isAuthenticated}
      <span class="footer-sep">·</span>
      <a class="footer-link" href="/support">Support</a>
    {/if}
    <span class="footer-sep">·</span>
    <a class="footer-link" href="https://2025.webai.run">2025</a>
  </div>
</footer>

<style>
  .skip-link {
    position: absolute;
    top: -100%;
    left: var(--space-2);
    z-index: calc(var(--z-overlay) + 1);
    padding: var(--space-1) var(--space-3);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-radius: var(--radius-base);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
  }

  .skip-link:focus {
    top: var(--space-1);
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 var(--space-2);
    border-bottom: 1px solid var(--color-nav-border);
    background: var(--color-nav-bg);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .nav-left, .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .logo {
    display: flex;
    align-items: center;
    text-decoration: none;
    margin-right: var(--space-3);
    position: relative;
    top: -2px;
  }

  .logo-icon :global(path),
  .logo-icon :global(circle) {
    stroke: var(--color-logo-stroke);
  }

  .logo-icon :global(path[fill]) {
    fill: var(--color-logo-stroke);
  }

  .logo-icon :global(.logo_cicle) {
    fill: var(--color-logo-node-fill);
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    min-height: 44px;
  }

  .nav-item {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-secondary);
    opacity: 0.7;
    padding: 6px 6px;
    border-radius: var(--radius-sm);
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    cursor: pointer;
    transition: opacity var(--transition-base), color var(--transition-base);
  }

  .nav-item:hover {
    opacity: 1;
    color: var(--color-text-primary);
  }

  .nav-cart {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .nav-cart-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }

  .admin-chevron {
    transition: transform var(--transition-base);
  }

  .admin-chevron.open {
    transform: rotate(180deg);
  }

  .user-menu-wrapper {
    position: relative;
  }

  .user-trigger {
    border: none;
    background: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
  }

  .nav-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
  }

  .nav-avatar-placeholder {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .user-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-half);
    min-width: 160px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-dropdown);
    z-index: var(--z-dropdown);
    padding: 0;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-3);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    text-decoration: none;
    text-align: left;
    border: none;
    background: none;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background: var(--color-nav-item-hover);
  }

  main {
    padding: var(--space-4) var(--space-3);
  }

  .hamburger {
    display: none;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: var(--space-half);
    margin-left: var(--space-half);
    border-radius: var(--radius-sm);
  }

  .hamburger:hover {
    background: var(--color-nav-item-hover);
  }

  .mobile-overlay {
    display: none;
  }

  .mobile-menu {
    display: none;
  }

  @media (max-width: 640px) {
    .hamburger {
      display: flex;
    }

    .nav-links {
      display: none;
    }

    .mobile-overlay {
      display: block;
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: var(--z-dropdown);
    }

    .mobile-menu {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 0;
      z-index: var(--z-overlay);
      box-shadow: var(--shadow-dropdown);
    }

    .mobile-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 12px var(--space-3);
      min-height: 44px;
      font-family: var(--font-ui);
      font-size: var(--text-base);
      font-weight: 600;
      text-align: left;
      color: var(--color-text-primary);
      background: none;
      border: none;
      border-bottom: 1px solid var(--color-border);
      cursor: pointer;
      transition: background var(--transition-base);
    }

    .mobile-section-header:hover {
      background: var(--color-nav-item-hover);
    }

    .mobile-section-header.active {
      box-shadow: inset 3px 0 0 var(--color-nav-active-border);
    }

    .mobile-section-body {
      padding: 4px 0 8px;
      background: var(--color-surface-sunken);
      border-bottom: 1px solid var(--color-border);
    }

    .mobile-group-label {
      padding: 8px var(--space-3) 4px;
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .mobile-link {
      display: flex;
      align-items: center;
      padding: 10px var(--space-3);
      min-height: 40px;
      font-family: var(--font-ui);
      font-size: var(--text-base);
      font-weight: 500;
      text-decoration: none;
      color: var(--color-text-secondary);
      transition: background var(--transition-base), color var(--transition-base);
    }

    .mobile-link:hover {
      background: var(--color-nav-item-hover);
      color: var(--color-text-primary);
    }

    .mobile-link.active {
      color: var(--color-primary);
      background: var(--color-nav-item-active);
    }


    main {
      padding: var(--space-4) var(--space-2) var(--space-2) var(--space-2);
    }
  }

  .hidden {
    display: none !important;
  }

  .site-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    row-gap: 0;
    column-gap: var(--space-3);
    padding: var(--space-2) var(--space-3) var(--space-6) var(--space-3);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .footer-brand {
    flex: 0 0 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-1);
  }

  .footer-copy {
    flex-shrink: 0;
  }

  .footer-copy a {
    color: inherit;
    text-decoration: none;
  }

  .footer-copy a:hover {
    text-decoration: underline;
    color: var(--color-primary);
  }

  .footer-link {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .footer-link:hover {
    text-decoration: underline;
    color: var(--color-primary);
  }

  .footer-sep {
    color: var(--color-border-strong);
    user-select: none;
  }

  .footer-caps {
    flex: 0 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .footer-cap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    cursor: default;
  }

  .footer-cap svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    fill: currentColor;
  }

  .cap-ok {
    color: var(--color-primary);
  }

  .cap-warn {
    color: var(--color-warning);
  }

  .footer-clear-cache {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: color var(--transition-base);
  }

  .footer-clear-cache:hover {
    color: var(--color-text-secondary);
  }

  @media (max-width: 640px) {
    .site-footer {
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-2) var(--space-4);
    }

    /* Force a clean 2x2 grid for the four caps on mobile.
       Without this, flex-wrap produces 3+1 or 2+2 depending on label widths. */
    .footer-caps {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-1) var(--space-2);
      width: 100%;
      max-width: 320px;
    }
    .footer-cap {
      justify-content: center;
    }

    .footer-cap:nth-child(1) {
      justify-self:flex-end;
    }

    .footer-cap:nth-child(2) {
      justify-self:flex-start;
    }

    .footer-cap:nth-child(3) {
      justify-self:flex-end;
    }

    .footer-cap:nth-child(4) {
      justify-self:flex-start;
    }

  }

  .interrupted-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-primary);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    color: var(--color-text-on-primary);
    flex-wrap: wrap;
  }

  .interrupted-text {
    flex: 1;
    min-width: 200px;
  }

  .interrupted-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 6px 14px;
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .interrupted-resume {
    background: var(--color-text-on-primary);
    color: var(--color-primary);
    border: 1px solid var(--color-text-on-primary);
  }

  .interrupted-resume:hover {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(255, 255, 255, 0.85);
  }

  .interrupted-dismiss {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.5);
    color: var(--color-text-on-primary);
  }

  .interrupted-dismiss:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.8);
  }
</style>
