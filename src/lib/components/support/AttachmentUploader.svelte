<script lang="ts">
  import { compressImage } from '$lib/utils/image-compress';
  let { files = $bindable([]) }: { files: { blob: Blob; name: string; w: number; h: number }[] } = $props();
  let error = $state('');

  async function onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    error = '';
    for (const file of Array.from(input.files ?? [])) {
      try {
        const { blob, w, h } = await compressImage(file);
        files = [...files, { blob, name: file.name.replace(/\.[^.]+$/, '.webp'), w, h }];
      } catch {
        error = `Could not process ${file.name}`;
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
        <li>{f.name} <button type="button" onclick={() => remove(i)}>×</button></li>
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
    font-size: var(--text-sm);
  }
</style>
