<script lang="ts" module>
  export interface NavLink { href: string; label: string; title?: string }
  export interface NavGroup {
    label?: string;
    links: NavLink[];
  }
</script>

<script lang="ts">
  import { page } from '$app/stores';

  let {
    label,
    isActive = false,
    groups,
    onclose,
  }: {
    label: string;
    isActive?: boolean;
    groups: NavGroup[];
    onclose?: () => void;
  } = $props();

  let open = $state(false);

  function toggle() { open = !open; }
  function close() { open = false; onclose?.(); }

  // A link is active if its href is the longest prefix of the current path
  // among links in this dropdown. This stops e.g. /inference (Search) from
  // lighting up when the user is at /inference/overrides — the longer match
  // wins. Exact `/` only matches `/`.
  const allHrefs = $derived(groups.flatMap(g => g.links.map(l => l.href)));

  function bestMatch(path: string): string | null {
    let best: string | null = null;
    for (const href of allHrefs) {
      if (href === '/') {
        if (path === '/' && (best === null || best.length < 1)) best = href;
        continue;
      }
      if (path === href || path.startsWith(href + '/')) {
        if (best === null || href.length > best.length) best = href;
      }
    }
    return best;
  }

  function isLinkActive(href: string): boolean {
    return bestMatch($page.url.pathname) === href;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="nav-dropdown-wrapper">
  <button
    class="nav-trigger"
    class:active={isActive}
    onclick={toggle}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    {label}
    <svg class="nav-chevron" class:open width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="nav-overlay" onclick={close} onkeydown={() => {}}></div>
    <div class="nav-popover" role="menu">
      {#each groups as group}
        {#if group.label}
          <div class="nav-section-label">{group.label}</div>
        {/if}
        {#each group.links as link}
          <a
            href={link.href}
            class="nav-link"
            class:active={isLinkActive(link.href)}
            onclick={close}
            role="menuitem"
            title={link.title}
          >
            {link.label}
          </a>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .nav-dropdown-wrapper {
    position: relative;
  }

  .nav-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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

  .nav-trigger:hover {
    opacity: 1;
    color: var(--color-text-primary);
  }

  .nav-trigger.active {
    opacity: 1;
    color: var(--color-text-primary);
    border-bottom-color: var(--color-nav-active-border);
  }

  .nav-chevron {
    transition: transform var(--transition-base);
    opacity: 0.6;
  }

  .nav-chevron.open {
    transform: rotate(180deg);
  }

  .nav-overlay {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-dropdown) - 1);
  }

  .nav-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 160px;
    width: max-content;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-dropdown);
    z-index: var(--z-dropdown);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: nav-popover-in 120ms ease-out;
  }

  @keyframes nav-popover-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-popover { animation: none; }
    .nav-chevron { transition: none; }
  }

  .nav-section-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    padding: 6px 10px 2px;
    user-select: none;
  }
  .nav-section-label:not(:first-child) {
    margin-top: 4px;
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
  }

  .nav-link {
    display: block;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-secondary);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .nav-link:hover {
    background: var(--color-nav-item-hover);
    color: var(--color-text-primary);
  }

  .nav-link.active {
    color: var(--color-primary);
    background: var(--color-nav-item-active);
  }
</style>
