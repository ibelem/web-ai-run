<script lang="ts">
  import type { Conversation, Message, Category } from '$lib/support/types';
  import { getMessages, sendMessage, setPublic, setStatus, markRead, uploadAttachment } from '$lib/support/crud';
  import MessageBubble from './MessageBubble.svelte';
  import MessageComposer from './MessageComposer.svelte';

  let { conversation, viewerId, isAdminViewer }: { conversation: Conversation; viewerId: string; isAdminViewer: boolean } = $props();
  let messages = $state<Message[]>([]);
  let isPublic = $state(conversation.is_public);
  let status = $state(conversation.status);

  $effect(() => {
    let cancelled = false;
    getMessages(conversation.id).then((m) => {
      if (!cancelled) messages = m;
    });
    markRead(conversation.id, viewerId);
    return () => {
      cancelled = true;
    };
  });

  async function handleSend(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const attachments = [];
    for (const f of p.files) {
      const path = await uploadAttachment(conversation.id, f.blob, f.name);
      attachments.push({ path, name: f.name, size: f.blob.size, w: f.w, h: f.h });
    }
    await sendMessage({ conversationId: conversation.id, senderId: viewerId, body: p.body, attachments });
    messages = await getMessages(conversation.id);
  }

  async function togglePublic() {
    isPublic = !isPublic;
    await setPublic(conversation.id, isPublic);
  }
  async function toggleResolved() {
    status = status === 'open' ? 'resolved' : 'open';
    await setStatus(conversation.id, status);
  }
  const canTogglePublic = $derived(viewerId === conversation.user_id);
</script>

<div class="thread">
  <header>
    <div class="meta">
      <span class="cat-chip">{conversation.category}</span>
      <span class="status-chip" class:resolved={status === 'resolved'}>{status}</span>
      {#if isPublic}<span class="faq-chip">FAQ</span>{/if}
    </div>
    <div class="actions">
      {#if canTogglePublic}
        <button class="action-btn" class:on={isPublic} onclick={togglePublic}>
          {isPublic ? 'Make private' : 'Make public'}
        </button>
      {/if}
      <button class="action-btn" class:on={status === 'resolved'} onclick={toggleResolved}>
        {status === 'open' ? 'Mark resolved' : 'Reopen'}
      </button>
    </div>
  </header>
  <div class="messages">
    {#each messages as m (m.id)}
      <MessageBubble message={m} isOwn={m.sender_id === viewerId} {isAdminViewer} />
    {/each}
  </div>
  <MessageComposer onsend={handleSend} />
</div>

<style>
  .thread {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .cat-chip {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 9px;
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }
  .status-chip {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: capitalize;
    padding: 2px 8px;
    border-radius: 9px;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }
  .status-chip.resolved {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }
  .faq-chip {
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9px;
    background: var(--color-accent-light);
    color: var(--color-primary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .action-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
  }
  .action-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
  .action-btn.on {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
    color: var(--color-primary);
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }
</style>
