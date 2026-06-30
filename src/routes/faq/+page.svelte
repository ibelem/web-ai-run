<script lang="ts">
  import { listPublicConversations, getMessages } from '$lib/support/crud';
  import FaqSearch from '$lib/components/support/FaqSearch.svelte';
  import MessageBubble from '$lib/components/support/MessageBubble.svelte';
  import type { Conversation, Message } from '$lib/support/types';

  let convs = $state<Conversation[]>([]);
  let active = $state<Conversation | null>(null);
  let threadCache = $state<Record<string, Message[]>>({});
  let query = $state('');
  let loading = $state(true);

  let reqId = 0;
  async function load(q = '') {
    const id = ++reqId;
    loading = true;
    const results = await listPublicConversations(q);
    // Ignore stale responses if a newer query started while this was in flight.
    if (id !== reqId) return;
    convs = results;
    loading = false;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function onSearch(q: string) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => load(q), 250);
  }

  $effect(() => {
    load();
  });

  async function select(c: Conversation) {
    active = c;
    if (!threadCache[c.id]) threadCache = { ...threadCache, [c.id]: await getMessages(c.id) };
  }
</script>

<header class="page-header">
  <h1>FAQ</h1>
  <p>Answers from real support conversations. Search or browse below.</p>
</header>

<div class="layout">
  <aside class:has-active={active}>
    <FaqSearch bind:value={query} onsearch={onSearch} />
    {#if loading}
      <p class="hint">Loading…</p>
    {:else if convs.length === 0}
      <p class="hint">No public questions yet{query ? ' for that search' : ''}.</p>
    {:else}
      <ul class="list">
        {#each convs as c (c.id)}
          <li>
            <button class="row" class:active={c.id === active?.id} onclick={() => select(c)}>
              <span class="cat">{c.category}</span>
              <span class="subj">{c.subject || 'Untitled question'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <section class:has-active={active}>
    {#if active}
      <button class="back" onclick={() => (active = null)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        All questions
      </button>
      <div class="answer-head">
        <span class="cat-chip">{active.category}</span>
        <h2>{active.subject || 'Untitled question'}</h2>
      </div>
      <div class="messages">
        {#each threadCache[active.id] ?? [] as m (m.id)}
          <MessageBubble message={m} isOwn={false} isAdminViewer={false} />
        {/each}
      </div>
    {:else}
      <p class="empty">Select a question to read the answer.</p>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: var(--space-3);
    min-height: 50vh;
  }
  aside {
    border-right: 1px solid var(--color-border);
    padding-right: var(--space-2);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-2);
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    transition: background var(--transition-base);
  }
  .row:hover {
    background: var(--color-nav-item-hover);
  }
  .row.active {
    background: var(--color-nav-item-active);
  }
  .cat {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .subj {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
  }
  section {
    min-width: 0;
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
  .answer-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .answer-head h2 {
    font-size: var(--text-lg);
    margin: 0;
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
    flex-shrink: 0;
  }
  .messages {
    display: flex;
    flex-direction: column;
  }
  .hint,
  .empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
    aside {
      border-right: none;
      padding-right: 0;
    }
    /* On mobile, show one pane at a time. */
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
