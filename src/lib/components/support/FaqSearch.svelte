<script lang="ts">
  let { value = $bindable(''), onsearch }: { value?: string; onsearch: (q: string) => void } = $props();
</script>

<form class="faq-search-wrap" onsubmit={(e) => { e.preventDefault(); onsearch(value); }}>
  <svg class="faq-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
  <input
    class="faq-search-input"
    type="search"
    placeholder="Search the FAQ…"
    aria-label="Search FAQ"
    bind:value
    autocomplete="off"
    spellcheck="false"
  />
  <button type="submit" class="faq-search-btn">Search</button>
</form>

<style>
  .faq-search-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
    max-width: 600px;
    margin: 0 auto var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-raised);
    padding: 0 0 0 10px;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .faq-search-wrap:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(9, 83, 222, 0.08);
  }

  .faq-search-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-right: 10px;
  }

  .faq-search-input {
    flex: 1;
    border: none !important;
    background: none;
    outline: none;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    padding: 14px 0;
    min-width: 0;
  }

  .faq-search-input::placeholder {
    color: var(--color-text-muted);
  }
  .faq-search-input::-webkit-search-cancel-button {
    display: none;
  }

  .faq-search-btn {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-base);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border: none;
    flex-shrink: 0;
    white-space: nowrap;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .faq-search-btn:hover {
    background: var(--color-primary-hover);
  }

  @media (max-width: 600px) {
    .faq-search-input {
      font-size: 15px;
    }
    .faq-search-btn {
      font-size: var(--text-sm);
      padding: 8px 14px;
    }
  }
</style>
