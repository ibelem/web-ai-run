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
  💬
  {#if $unreadCount > 0}<span class="badge">{$unreadCount}</span>{/if}
</button>

{#if open}
  <div class="panel">
    <header>
      <strong>Support</strong>
      <button onclick={() => { composingNew = true; active = null; }}>New</button>
      <button onclick={() => (open = false)} aria-label="Close">×</button>
    </header>
    {#if composingNew}
      <MessageComposer showCategory onsend={startNew} />
    {:else if active}
      <button class="back" onclick={() => (active = null)}>← All conversations</button>
      <ConversationThread conversation={active} {viewerId} {isAdminViewer} />
    {:else}
      <ConversationList conversations={$support.conversations} reads={$support.reads} onselect={(c) => (active = c)} />
    {/if}
  </div>
{/if}

<style>
  .fab {
    position: fixed;
    right: var(--space-3);
    bottom: var(--space-3);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border: none;
    font-size: 22px;
    cursor: pointer;
    z-index: var(--z-overlay);
    box-shadow: var(--shadow-dropdown);
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
    bottom: calc(var(--space-3) + 64px);
    width: 360px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-dropdown);
    z-index: var(--z-overlay);
    padding: var(--space-2);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  header strong {
    flex: 1;
  }
  .back {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
  }
</style>
