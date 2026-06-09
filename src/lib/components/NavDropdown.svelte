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

  function isLinkActive(href: string): boolean {
    const path = $page.url.pathname;
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
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
        <div class="nav-row" class:nav-row-single={!group.label && group.links.length === 1}>
          {#if group.label}
            <span class="nav-row-label">{group.label}</span>
            <div class="nav-row-links">
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
            </div>
          {:else if group.links.length === 1}
            <a
              href={group.links[0].href}
              class="nav-link nav-link-single"
              class:active={isLinkActive(group.links[0].href)}
              onclick={close}
              role="menuitem"
              title={group.links[0].title}
            >
              {group.links[0].label}
            </a>
          {:else}
            <span class="nav-row-label"></span>
            <div class="nav-row-links">
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
            </div>
          {/if}
        </div>
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
    min-width: 240px;
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

  .nav-row {
    display: grid;
    grid-template-columns: 70px max-content;
    align-items: center;
    column-gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    min-height: 32px;
  }

  .nav-row-single {
    grid-template-columns: 1fr;
    padding: 0;
  }

  .nav-row-label {
    display: inline-flex;
    align-items: center;
    height: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
    user-select: none;
    white-space: nowrap;
    padding: 2px 0 0 4px;
  }

  .nav-row-links {
    display: flex;
    flex-wrap: nowrap;
    gap: 2px;
  }

  .nav-link {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-secondary);
    padding: 4px 10px;
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

  .nav-link-single {
    display: block;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
    padding: 8px 10px;
  }

  .nav-link-single:hover {
    color: var(--color-text-primary);
    background: var(--color-nav-item-hover);
  }

  .nav-link-single.active {
    color: var(--color-primary);
    background: var(--color-nav-item-active);
  }
</style>
