<script lang="ts">
  import { support } from '$lib/stores/support';
  import { auth } from '$lib/stores/auth';
  import ConversationList from '$lib/components/support/ConversationList.svelte';
  import ConversationThread from '$lib/components/support/ConversationThread.svelte';
  import { sendMessage } from '$lib/support/crud';
  import type { Conversation } from '$lib/support/types';

  let active = $state<Conversation | null>(null);
  let categoryFilter = $state<'all' | 'bug' | 'feature' | 'howto' | 'other'>('all');
  let statusFilter = $state<'all' | 'open' | 'resolved'>('all');
  let internalNote = $state('');

  const viewerId = $derived($auth.user?.id ?? '');
  const filtered = $derived(
    $support.conversations.filter(
      (c) =>
        (categoryFilter === 'all' || c.category === categoryFilter) &&
        (statusFilter === 'all' || c.status === statusFilter)
    )
  );

  async function addInternalNote() {
    if (!active || !internalNote.trim()) return;
    await sendMessage({ conversationId: active.id, senderId: viewerId, body: internalNote.trim(), isInternal: true });
    internalNote = '';
  }
</script>

<header class="page-header">
  <h1>Support inbox</h1>
  <p>All user conversations. Reply, resolve, and add internal notes.</p>
</header>
<div class="filters">
  <select bind:value={categoryFilter}>
    <option value="all">All categories</option>
    <option value="bug">Bug</option>
    <option value="feature">Feature</option>
    <option value="howto">How-to</option>
    <option value="other">Other</option>
  </select>
  <select bind:value={statusFilter}>
    <option value="all">All statuses</option>
    <option value="open">Open</option>
    <option value="resolved">Resolved</option>
  </select>
</div>

<div class="layout">
  <aside class:has-active={!!active}>
    <ConversationList conversations={filtered} reads={$support.reads} activeId={active?.id} onselect={(c) => (active = c)} />
  </aside>
  <section class:has-active={!!active}>
    {#if active}
      <button class="back" onclick={() => (active = null)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        All conversations
      </button>
      <div class="thread-wrap">
        <ConversationThread conversation={active} {viewerId} isAdminViewer={true} />
      </div>
      <div class="internal">
        <textarea bind:value={internalNote} rows="2" placeholder="Internal note (only admins see this)"></textarea>
        <button
          class="note-btn"
          class:btn-primary={!!internalNote.trim()}
          class:btn-ghost={!internalNote.trim()}
          onclick={addInternalNote}
          disabled={!internalNote.trim()}
        >Add internal note</button>
      </div>
    {:else}
      <p class="empty">Select a conversation.</p>
    {/if}
  </section>
</div>

<style>
  .filters {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: var(--space-3);
    min-height: 60vh;
    margin-bottom: var(--space-6);
  }
  aside {
    border-right: 1px solid var(--color-border);
  }
  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-height: calc(100vh - 220px);
  }
  .thread-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .thread-wrap :global(.thread) {
    height: 100%;
  }
  .internal {
    margin-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-top: 1px solid var(--color-warning);
    padding-top: var(--space-3);
  }
  .internal textarea {
    width: 100%;
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
  }
  .note-btn {
    align-self: flex-start;
  }
  .empty {
    color: var(--color-text-muted);
  }
  .back {
    display: none;
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
  }
  .back:hover {
    background: var(--color-nav-item-hover);
    color: var(--color-text-primary);
  }
  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
    aside.has-active {
      display: none;
    }
    section:not(.has-active) {
      display: none;
    }
    .back {
      display: inline-flex;
    }
    /* Free height on mobile so the internal note isn't cramped. */
    section {
      max-height: none;
    }
  }
</style>
