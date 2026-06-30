<script lang="ts">
  import type { Category } from '$lib/support/types';
  import AttachmentUploader from './AttachmentUploader.svelte';
  let { showCategory = false, onsend }: {
    showCategory?: boolean;
    onsend: (payload: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) => Promise<void>;
  } = $props();

  let body = $state('');
  let category = $state<Category>('howto');
  let files = $state<{ blob: Blob; name: string; w: number; h: number }[]>([]);
  let sending = $state(false);
  let error = $state('');

  async function submit() {
    if (!body.trim() || sending) return;
    sending = true;
    error = '';
    try {
      await onsend({ body: body.trim(), category: showCategory ? category : undefined, files });
      body = '';
      files = [];
    } catch {
      error = 'Send failed. Your draft is kept — try again.';
    } finally {
      sending = false;
    }
  }
</script>

<div class="composer">
  {#if showCategory}
    <select bind:value={category} aria-label="Category">
      <option value="bug">Bug</option>
      <option value="feature">Feature request</option>
      <option value="howto">How-to question</option>
      <option value="other">Other</option>
    </select>
  {/if}
  <textarea bind:value={body} placeholder="Type your message…" rows="3"></textarea>
  <AttachmentUploader bind:files />
  {#if error}<p class="err">{error}</p>{/if}
  <button class="send" onclick={submit} disabled={sending || !body.trim()}>
    {sending ? 'Sending…' : 'Send'}
  </button>
</div>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  textarea {
    width: 100%;
    resize: vertical;
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
  }
  .send {
    align-self: flex-end;
  }
  .err {
    color: var(--color-warning);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
