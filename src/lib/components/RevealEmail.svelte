<script lang="ts">
  // A click-to-reveal email component.
  //
  // Why this exists: putting an email address as plain text in HTML is the
  // single biggest source of address-harvesting spam — every basic crawler
  // grabs `mailto:` links and `name@domain` patterns out of static markup.
  //
  // Strategy: split the address into halves stored as separate props, hold
  // them off the DOM until the user clicks "Show email", and only join them
  // in JS at click time. The address never appears in:
  //   - The server-rendered HTML (SSR sees only the placeholder button)
  //   - The static source view ("View source" shows nothing useful)
  //
  // A determined crawler that runs JS *and* clicks the button could still get
  // it; this just raises the bar above what 99% of scrapers bother with.
  //
  // Usage:  <RevealEmail user="contact" host="webai.run" />

  let { user, host, label }: { user: string; host: string; label?: string } = $props();

  let revealed = $state(false);
  let address = $state('');

  function reveal() {
    // Defer the join until click — keeps the unjoined string out of state
    // captures that bots might watch.
    address = `${user}@${host}`;
    revealed = true;
  }

  async function copy() {
    if (!revealed) reveal();
    try {
      await navigator.clipboard.writeText(`${user}@${host}`);
    } catch {}
  }
</script>

{#if revealed}
  <a class="reveal-email-link" href={`mailto:${address}`}>{address}</a>
  <button type="button" class="reveal-email-copy" onclick={copy} title="Copy address">copy</button>
{:else}
  <button type="button" class="reveal-email-btn" onclick={reveal} aria-label={label ?? 'Reveal contact email'}>
    {label ?? 'Show email'}
  </button>
{/if}

<style>
  .reveal-email-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 1px 8px;
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base);
  }
  .reveal-email-btn:hover {
    border-color: var(--color-primary);
    border-style: solid;
    color: var(--color-primary);
  }
  .reveal-email-link {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--color-surface-sunken);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    text-decoration: none;
  }
  .reveal-email-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .reveal-email-copy {
    font-family: var(--font-ui);
    font-size: 10px;
    margin-left: 4px;
    padding: 0 5px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .reveal-email-copy:hover { color: var(--color-primary); }
</style>
