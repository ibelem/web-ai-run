<script lang="ts">
  import { support, unreadCount } from '$lib/stores/support';
  import { auth } from '$lib/stores/auth';
  import ConversationList from './ConversationList.svelte';
  import ConversationThread from './ConversationThread.svelte';
  import MessageComposer from './MessageComposer.svelte';
  import { createConversation } from '$lib/support/crud';
  import type { Conversation, Category } from '$lib/support/types';

  let open = $state(false);
  let active = $state<Conversation | null>(null);
  let composingNew = $state(false);

  const viewerId = $derived($auth.user?.id ?? '');
  const isAdminViewer = $derived($auth.role === 'admin');

  async function startNew(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const c = await createConversation({ userId: viewerId, category: p.category ?? 'other', body: p.body });
    composingNew = false;
    active = c;
  }
</script>

<button class="fab" onclick={() => (open = !open)} aria-label="Support messages">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z"/>
  </svg>
  {#if $unreadCount > 0}<span class="badge">{$unreadCount}</span>{/if}
</button>

{#if open}
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Support</span>
      <button class="panel-close" onclick={() => (open = false)} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="panel-body">
      {#if composingNew}
        <button class="panel-back" onclick={() => (composingNew = false)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          All conversations
        </button>
        <MessageComposer showCategory onsend={startNew} />
      {:else if active}
        <button class="panel-back" onclick={() => (active = null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          All conversations
        </button>
        <ConversationThread conversation={active} {viewerId} {isAdminViewer} />
      {:else}
        <ConversationList conversations={$support.conversations} reads={$support.reads} onselect={(c) => (active = c)} />
      {/if}
    </div>

    {#if !composingNew && !active}
      <div class="panel-footer">
        <button class="btn-run" onclick={() => { composingNew = true; active = null; }}>New conversation</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .fab {
    position: fixed;
    right: var(--space-3);
    bottom: var(--space-3);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    cursor: pointer;
    z-index: var(--z-overlay);
    box-shadow: var(--shadow-dropdown);
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .fab:hover {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }
  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-warning);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panel {
    position: fixed;
    right: var(--space-3);
    bottom: calc(var(--space-3) + 56px);
    width: min(360px, calc(100vw - var(--space-3) * 2));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);
    z-index: var(--z-overlay);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .panel-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .panel-close:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
  }

  .panel-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: var(--space-2);
    padding: 4px 8px 4px 4px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .panel-back:hover {
    background: var(--color-nav-item-hover);
    color: var(--color-text-primary);
  }

  .panel-footer {
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .btn-run {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-run:hover {
    background: var(--color-primary-hover);
  }
</style>
