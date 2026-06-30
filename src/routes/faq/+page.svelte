<script lang="ts">
  import { listPublicConversations, getMessages } from '$lib/support/crud';
  import FaqSearch from '$lib/components/support/FaqSearch.svelte';
  import MessageBubble from '$lib/components/support/MessageBubble.svelte';
  import type { Conversation, Message } from '$lib/support/types';

  let convs = $state<Conversation[]>([]);
  let expanded = $state<string | null>(null);
  let threadCache = $state<Record<string, Message[]>>({});
  let query = $state('');
  let loading = $state(true);

  async function load(q = '') {
    loading = true;
    convs = await listPublicConversations(q);
    loading = false;
  }
  $effect(() => {
    load();
  });

  async function toggle(c: Conversation) {
    if (expanded === c.id) {
      expanded = null;
      return;
    }
    expanded = c.id;
    if (!threadCache[c.id]) threadCache = { ...threadCache, [c.id]: await getMessages(c.id) };
  }
</script>

<h1>FAQ</h1>
<FaqSearch bind:value={query} onsearch={(q) => load(q)} />

{#if loading}
  <p>Loading…</p>
{:else if convs.length === 0}
  <p>No public questions yet{query ? ' for that search' : ''}.</p>
{:else}
  <ul class="faq">
    {#each convs as c (c.id)}
      <li>
        <button class="q" onclick={() => toggle(c)}>
          <span class="cat">{c.category}</span>
          {c.subject ?? '(question)'}
        </button>
        {#if expanded === c.id}
          <div class="a">
            {#each threadCache[c.id] ?? [] as m (m.id)}
              <MessageBubble message={m} isOwn={false} isAdminViewer={false} />
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .faq {
    list-style: none;
    padding: 0;
  }
  .q {
    width: 100%;
    text-align: left;
    padding: var(--space-2);
    border: none;
    border-bottom: 1px solid var(--color-border);
    background: none;
    cursor: pointer;
    font-weight: 600;
  }
  .cat {
    font-size: var(--text-xs);
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-right: var(--space-1);
  }
  .a {
    padding: var(--space-2);
  }
</style>
