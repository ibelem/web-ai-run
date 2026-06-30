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
    <span class="cat">{conversation.category}</span>
    <span class="status" class:resolved={status === 'resolved'}>{status}</span>
    {#if canTogglePublic}
      <button onclick={togglePublic}>{isPublic ? 'Make private' : 'Make public (FAQ)'}</button>
    {/if}
    <button onclick={toggleResolved}>{status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
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
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .cat {
    text-transform: capitalize;
    font-weight: 600;
  }
  .status.resolved {
    color: var(--color-primary);
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }
</style>
