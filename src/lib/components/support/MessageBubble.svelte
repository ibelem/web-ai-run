<script lang="ts">
  import type { Message } from '$lib/support/types';
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  let { message, isOwn, isAdminViewer }: { message: Message; isOwn: boolean; isAdminViewer: boolean } = $props();
  const base = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/support-attachments/`;
</script>

<div class="bubble" class:own={isOwn} class:internal={message.is_internal}>
  {#if message.is_internal && isAdminViewer}
    <span class="internal-tag">Internal note</span>
  {/if}
  <p class="body">{message.body}</p>
  {#if message.attachments?.length}
    <div class="attachments">
      {#each message.attachments as a}
        <a href={base + a.path} target="_blank" rel="noopener">
          <img src={base + a.path} alt={a.name} loading="lazy" crossorigin="anonymous" />
        </a>
      {/each}
    </div>
  {/if}
  <time>{new Date(message.created_at).toLocaleString()}</time>
</div>

<style>
  .bubble {
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    margin-bottom: var(--space-2);
    max-width: 80%;
  }
  .bubble.own {
    background: var(--color-nav-item-active);
    margin-left: auto;
  }
  .bubble.internal {
    border: 1px dashed var(--color-warning);
  }
  .internal-tag {
    font-size: var(--text-xs);
    color: var(--color-warning);
    font-weight: 600;
  }
  .body {
    white-space: pre-wrap;
    margin: 0 0 var(--space-1);
  }
  .attachments {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }
  .attachments img {
    max-width: 160px;
    border-radius: var(--radius-base);
  }
  time {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
</style>
