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
  <aside>
    <ConversationList conversations={filtered} reads={$support.reads} activeId={active?.id} onselect={(c) => (active = c)} />
  </aside>
  <section>
    {#if active}
      <ConversationThread conversation={active} {viewerId} isAdminViewer={true} />
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
  }
  aside {
    border-right: 1px solid var(--color-border);
  }
  .internal {
    margin-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border-top: 1px dashed var(--color-warning);
    padding-top: var(--space-2);
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
  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
