<script lang="ts">
  import { support, refreshSupport } from '$lib/stores/support';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import ConversationList from '$lib/components/support/ConversationList.svelte';
  import ConversationThread from '$lib/components/support/ConversationThread.svelte';
  import MessageComposer from '$lib/components/support/MessageComposer.svelte';
  import { createConversation } from '$lib/support/crud';
  import type { Conversation, Category } from '$lib/support/types';

  let active = $state<Conversation | null>(null);
  let composingNew = $state(false);
  const viewerId = $derived($auth.user?.id ?? '');
  const isAdminViewer = $derived($auth.role === 'admin');

  async function startNew(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const c = await createConversation({ userId: viewerId, category: p.category ?? 'other', body: p.body });
    composingNew = false;
    active = c;
    await refreshSupport();
  }
</script>

{#if !$isAuthenticated}
  <div class="gate">
    <h1>Sign in to ask a question</h1>
    <p>Support conversations are private to your account.</p>
    <a class="btn-primary" href="/login">Sign in</a>
  </div>
{:else}
  <header class="page-header">
    <h1>Support</h1>
    <p>Ask a question and we'll reply here. Mark a thread public to add it to the FAQ.</p>
  </header>
  <div class="layout">
    <aside>
      <button class="btn-primary new" onclick={() => { composingNew = true; active = null; }}>New conversation</button>
      <ConversationList
        conversations={$support.conversations}
        reads={$support.reads}
        activeId={active?.id}
        onselect={(c) => { active = c; composingNew = false; }}
      />
    </aside>
    <section>
      {#if composingNew}
        <MessageComposer showCategory onsend={startNew} />
      {:else if active}
        <ConversationThread conversation={active} {viewerId} {isAdminViewer} />
      {:else}
        <p class="empty">Select a conversation or start a new one.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .gate {
    max-width: 420px;
    margin: var(--space-6) auto;
    text-align: center;
  }
  .gate .btn-primary {
    display: inline-block;
    margin-top: var(--space-2);
    text-decoration: none;
  }
  .layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: var(--space-3);
    min-height: 60vh;
  }
  aside {
    border-right: 1px solid var(--color-border);
  }
  .new {
    margin: 0 0 var(--space-2) 0;
    text-align: center;
  }
  .empty {
    color: var(--color-text-muted);
  }
  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
    aside {
      border-right: none;
    }
  }
</style>
