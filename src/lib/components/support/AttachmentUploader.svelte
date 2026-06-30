<script lang="ts">
  import { compressImage, ImageValidationError } from '$lib/utils/image-compress';
  let { files = $bindable([]) }: { files: { blob: Blob; name: string; w: number; h: number }[] } = $props();
  let error = $state('');

  async function onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    error = '';
    for (const file of Array.from(input.files ?? [])) {
      try {
        const { blob, w, h } = await compressImage(file);
        files = [...files, { blob, name: file.name.replace(/\.[^.]+$/, '.webp'), w, h }];
      } catch (err) {
        error = err instanceof ImageValidationError ? err.message : `Could not process ${file.name}`;
      }
    }
    input.value = '';
  }
  function remove(i: number) {
    files = files.filter((_, idx) => idx !== i);
  }
</script>

<div class="uploader">
  <label class="pick">
    Attach image
    <input type="file" accept="image/*" multiple onchange={onPick} hidden />
  </label>
  {#if error}<span class="err">{error}</span>{/if}
  {#if files.length}
    <ul class="thumbs">
      {#each files as f, i}
        <li class="chip">
          <span class="chip-name" title={f.name}>{f.name}</span>
          <button type="button" class="chip-remove" onclick={() => remove(i)} aria-label="Remove {f.name}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .pick {
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--color-primary);
  }
  .err {
    color: var(--color-warning);
    font-size: var(--text-sm);
  }
  .thumbs {
    list-style: none;
    padding: 0;
    margin: var(--space-1) 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 3px 4px 3px 8px;
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }
  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }
  .chip-remove:hover {
    background: var(--color-error);
    color: var(--color-text-on-primary);
  }
</style>
