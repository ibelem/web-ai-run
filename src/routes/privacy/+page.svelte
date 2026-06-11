<!--
  Privacy Policy

  Drafted as a factual snapshot of what the app does today. Marked TODOs are
  fields you must fill in (or remove the section) before treating this as a
  live legal document. Have someone with authority review before publishing.
-->
<script lang="ts">
  import RevealEmail from '$lib/components/RevealEmail.svelte';

  // Last reviewed date — keep in sync with substantive edits to this page.
  const updated = '2026-06-11';
</script>

<svelte:head>
  <title>Privacy · Web AI Benchmark</title>
  <!-- Keep this page out of search-engine indexes so the contact email and
       deletion-request flow aren't surfaced via Google / Bing / etc. The
       email itself is also click-to-reveal, so a crawler that ignores this
       directive still won't find it in the rendered HTML. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<article class="legal">
  <header class="legal-header">
    <h1>Privacy</h1>
    <p class="muted">Last updated: {updated}</p>
  </header>

  <section>
    <p>
      Web AI Benchmark is a tool that benchmarks on-device AI inference
      inside your browser. This page describes what data the app collects,
      where it goes, and how to remove it.
    </p>
  </section>

  <section>
    <h2>What we never collect</h2>
    <ul>
      <li><strong>Model weights, prompts, and generated text never leave your browser.</strong> Benchmarks run locally via WebGPU, WebNN, or WebAssembly. The runtime fetches model files directly from HuggingFace into your browser; we don't proxy or copy them.</li>
      <li><strong>No analytics, ads, or behavioral tracking.</strong> No third-party SDKs.</li>
    </ul>
  </section>

  <section>
    <h2>What we collect when you sign in</h2>
    <p>If you sign in with GitHub or Google, the OAuth provider sends us:</p>
    <ul>
      <li>Your email address.</li>
      <li>Your provider profile (display name, avatar URL).</li>
      <li>A user identifier issued by the provider.</li>
    </ul>
    <p>
      We use this to scope your benchmark history and recipes to your account.
      You can update your display name and upload a custom avatar from
      <a href="/account">Account</a>.
    </p>
  </section>

  <section>
    <h2>What we collect when you click "Upload results"</h2>
    <p>
      The "Upload results" toggle on the run pages is opt-in and only available
      while signed in. When enabled, after each benchmark we save:
    </p>
    <ul>
      <li>Benchmark metrics (latency, throughput, TTFT, TPS, decode time, etc.).</li>
      <li>Run configuration (backend, dtype, framework version, iterations, prompt-token count, max-new-tokens).</li>
      <li>The HuggingFace model identifier and file path you ran — never the model bytes themselves.</li>
      <li>Hardware details you typed in: CPU, OS, GPU/NPU driver versions.</li>
      <li>Auto-detected environment: browser name and version, GPU adapter string.</li>
      <li>A run timestamp and the user identifier from your account.</li>
    </ul>
    <p>
      None of this is collected when "Upload results" is off, even when you're signed in.
    </p>
  </section>

  <section>
    <h2>Where saved data lives</h2>
    <p>
      Account info, profiles, recipes, and saved benchmark results are stored
      in a hosted database. Access is gated by row-level security so users
      can only read and delete their own rows. Saved benchmark results
      themselves are immutable; to update a measurement, run the benchmark
      again.
    </p>
  </section>

  <section>
    <h2>Data that stays only in your browser</h2>
    <ul>
      <li><strong>Model file cache</strong> (OPFS): downloaded model weights so subsequent runs don't re-download. Wipe via the "Clear Model Cache" button in the footer or your browser's site-data tools.</li>
      <li><strong>Model catalog</strong> (IndexedDB): a cached copy of the public model catalog used by the Browse page.</li>
      <li><strong>Preferences</strong> (localStorage): table column choices, filter values, recently-used hardware fields.</li>
      <li><strong>Interrupted-run state</strong> (localStorage): so the app can offer to resume a run after a crash or accidental close.</li>
    </ul>
    <p>None of these are sent to our servers.</p>
  </section>

  <section>
    <h2>Third parties</h2>
    <ul>
      <li><strong>HuggingFace</strong> — model files are fetched from huggingface.co directly to your browser. They see your IP address and which models you fetch, subject to their own privacy policy.</li>
      <li><strong>GitHub OAuth / Google OAuth</strong> — only when you sign in.</li>
    </ul>
  </section>

  <section>
    <h2>Retention and deletion</h2>
    <p>
      Saved benchmark results are kept until you delete them or close your
      account. We don't auto-expire or anonymize.
    </p>
    <ul>
      <li>Delete individual results from <a href="/inference/results">/inference/results</a> or <a href="/llm/results">/llm/results</a>.</li>
      <li>Delete recipes from <a href="/inference/recipe">/inference/recipe</a> or <a href="/llm/recipe">/llm/recipe</a>.</li>
      <li>To delete your account and all associated data, email <RevealEmail user="contact" host="webai.run" />.</li>
    </ul>
    <p>
      Site administrators may also delete any user data (accounts, results,
      recipes, or shared links) at their discretion — for example to remove
      spam, content that violates the terms of service, or at a user's
      request.
    </p>
  </section>

  <section>
    <h2>Your rights</h2>
    <p>
      Depending on where you live, you may have rights to access, correct,
      export, or delete the personal data we hold about you. We honour these
      requests for any signed-in user. Contact us at
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>

  <section>
    <h2>Children</h2>
    <p>
      The service is not directed at children under 18 (or the equivalent
      minimum age in your jurisdiction). We don't knowingly collect data from
      them. If you believe a child has signed up, contact us and we'll remove
      the account.
    </p>
  </section>

  <section>
    <h2>Changes</h2>
    <p>
      We'll update the "Last updated" date when we change this page. For
      material changes that affect how saved data is used, we'll notify
      signed-in users via the app.
    </p>
  </section>

  <section>
    <h2>Contact</h2>
    <p>
      For privacy questions or data-deletion requests:
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>
</article>

<style>
  .legal {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-2);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    line-height: 1.65;
  }
  .legal-header {
    margin-bottom: var(--space-4);
  }
  .legal-header h1 {
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-half);
  }
  .legal-header .muted {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }
  .legal section {
    margin-bottom: var(--space-3);
  }
  .legal h2 {
    font-size: var(--text-base);
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-1);
    color: var(--color-text-primary);
  }
  .legal p, .legal ul {
    margin: 0 0 var(--space-1);
  }
  .legal ul {
    padding-left: var(--space-3);
  }
  .legal li {
    margin-bottom: 4px;
  }
  .legal a {
    color: var(--color-primary);
  }
  .muted {
    color: var(--color-text-muted);
  }
</style>
