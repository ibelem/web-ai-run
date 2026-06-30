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
  const paneOpen = $derived(!!active || composingNew);

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
    <aside class:has-active={paneOpen}>
      <button class="btn-primary new" onclick={() => { composingNew = true; active = null; }}>New conversation</button>
      <ConversationList
        conversations={$support.conversations}
        reads={$support.reads}
        activeId={active?.id}
        onselect={(c) => { active = c; composingNew = false; }}
      />
    </aside>
    <section class:has-active={paneOpen}>
      {#if composingNew}
        <button class="back" onclick={() => (composingNew = false)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          All conversations
        </button>
        <MessageComposer showCategory onsend={startNew} />
      {:else if active}
        <button class="back" onclick={() => (active = null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          All conversations
        </button>
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
    aside {
      border-right: none;
    }
    /* One pane at a time on mobile. */
    aside.has-active {
      display: none;
    }
    section:not(.has-active) {
      display: none;
    }
    .back {
      display: inline-flex;
    }
  }
</style>
