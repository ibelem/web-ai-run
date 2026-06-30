<script lang="ts">
  import type { Conversation } from '$lib/support/types';
  let { conversations, reads, activeId, onselect }: {
    conversations: Conversation[];
    reads: Record<string, string>;
    activeId?: string;
    onselect: (c: Conversation) => void;
  } = $props();
  function unread(c: Conversation): boolean {
    const r = reads[c.id];
    return !r || new Date(c.last_message_at).getTime() > new Date(r).getTime();
  }
</script>

<ul class="list">
  {#each conversations as c (c.id)}
    <li>
      <button class="row" class:active={c.id === activeId} class:unread={unread(c)} onclick={() => onselect(c)}>
        <span class="cat">{c.category}</span>
        <span class="subj">{c.subject || 'Untitled conversation'}</span>
        {#if c.is_public}<span class="pub">FAQ</span>{/if}
        {#if unread(c)}<span class="dot" aria-label="unread"></span>{/if}
      </button>
    </li>
  {/each}
</ul>

<style>
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
  }
  .row.active {
    background: var(--color-nav-item-active);
  }
  .row.unread .subj {
    font-weight: 700;
  }
  .cat {
    font-size: var(--text-xs);
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .subj {
    flex: 1;
  }
  .pub {
    font-size: var(--text-xs);
    color: var(--color-primary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
  }
</style>
