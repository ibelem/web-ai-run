<!--
  Privacy Policy

  Drafted as a factual snapshot of what the app does today. Marked TODOs are
  fields you must fill in (or remove the section) before treating this as a
  live legal document. Have someone with authority review before publishing.
-->
<script lang="ts">
  import RevealEmail from '$lib/components/RevealEmail.svelte';

  // Last reviewed date — keep in sync with substantive edits to this page.
  const updated = '2026-07-01';
</script>

<svelte:head>
  <title>Privacy · Web AI Benchmark</title>
  <!-- Keep this page out of search-engine indexes so the contact email and
       deletion-request flow aren't surfaced via Google / Bing / etc. The
       email itself is also click-to-reveal, so a crawler that ignores this
       directive still won't find it in the rendered HTML. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="legal-layout">
  <nav class="toc" aria-label="Table of contents">
    <details class="toc-details" open>
      <summary class="toc-summary">On this page</summary>
      <ol class="toc-list">
        <li><a href="#never-collect">What we never collect</a></li>
        <li><a href="#sign-in">What we collect when you sign in</a></li>
        <li><a href="#activity">Account event logging</a></li>
        <li><a href="#upload">What we collect on upload</a></li>
        <li><a href="#storage">Where saved data lives</a></li>
        <li><a href="#browser-only">Data that stays in your browser</a></li>
        <li><a href="#third-parties">Third parties</a></li>
        <li><a href="#retention">Retention and deletion</a></li>
        <li><a href="#rights">Your rights</a></li>
        <li><a href="#children">Children</a></li>
        <li><a href="#changes">Changes</a></li>
        <li><a href="#contact">Contact</a></li>
      </ol>
    </details>
  </nav>

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

  <section id="never-collect">
    <h2>What we never collect <a class="anchor" href="#never-collect" aria-label="Link to this section">§</a></h2>
    <ul>
      <li><strong>Model weights, prompts, and generated text never leave your browser.</strong> Benchmarks run locally via WebGPU, WebNN, or WebAssembly. The runtime fetches model files directly from HuggingFace into your browser; we don't proxy or copy them.</li>
      <li><strong>No third-party analytics, ads, or SDKs.</strong> Any activity logging we do is first-party and described below — we don't share it with advertisers or data brokers.</li>
    </ul>
  </section>

  <section id="sign-in">
    <h2>What we collect when you sign in <a class="anchor" href="#sign-in" aria-label="Link to this section">§</a></h2>
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

  <section id="activity">
    <h2>Account event logging <a class="anchor" href="#activity" aria-label="Link to this section">§</a></h2>
    <p>
      We log a small set of security- and account-relevant events, not the
      pages you browse. Specifically: signing in, your role changing,
      uploading or deleting a benchmark result, and deleting a recipe —
      each with a timestamp. We don't log page visits, query parameters, or
      anything else you do on the site.
    </p>
    <p>
      Unlike your profile or benchmark results, you can't read or delete
      this log yourself — it's only readable by site administrators, and
      only to investigate a specific support request, abuse report, or
      account issue. It isn't shared with third parties, and it isn't used
      for analytics, ads, or general browsing of user activity.
    </p>
    <p>
      Our legal basis for this (for EU/EEA users) is legitimate interest in
      keeping the service secure and able to support you (GDPR Art.
      6(1)(f)). You can object to this processing at any time — contact us
      under <a href="#rights">Your rights</a> and we'll stop unless we have
      a compelling reason tied to an active abuse or security investigation.
    </p>
  </section>

  <section id="upload">
    <h2>What we collect when you click "Upload results" <a class="anchor" href="#upload" aria-label="Link to this section">§</a></h2>
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

  <section id="storage">
    <h2>Where saved data lives <a class="anchor" href="#storage" aria-label="Link to this section">§</a></h2>
    <p>
      Account info, profiles, recipes, and saved benchmark results are stored
      in a hosted database. Access is gated by row-level security so users
      can only read and delete their own rows. Saved benchmark results
      themselves are immutable; to update a measurement, run the benchmark
      again.
    </p>
  </section>

  <section id="browser-only">
    <h2>Data that stays only in your browser <a class="anchor" href="#browser-only" aria-label="Link to this section">§</a></h2>
    <ul>
      <li><strong>Model file cache</strong> (OPFS): downloaded model weights so subsequent runs don't re-download. Wipe via the "Clear Model Cache" button in the footer or your browser's site-data tools.</li>
      <li><strong>Model catalog</strong> (IndexedDB): a cached copy of the public model catalog used by the Browse page.</li>
      <li><strong>Preferences</strong> (localStorage): table column choices, filter values, recently-used hardware fields.</li>
      <li><strong>Interrupted-run state</strong> (localStorage): so the app can offer to resume a run after a crash or accidental close.</li>
    </ul>
    <p>None of these are sent to our servers.</p>
  </section>

  <section id="third-parties">
    <h2>Third parties <a class="anchor" href="#third-parties" aria-label="Link to this section">§</a></h2>
    <ul>
      <li><strong>HuggingFace</strong> — model files are fetched from huggingface.co directly to your browser. They see your IP address and which models you fetch, subject to their own privacy policy.</li>
      <li><strong>GitHub OAuth / Google OAuth</strong> — only when you sign in.</li>
    </ul>
  </section>

  <section id="retention">
    <h2>Retention and deletion <a class="anchor" href="#retention" aria-label="Link to this section">§</a></h2>
    <p>
      Saved benchmark results are kept until you delete them or close your
      account. We don't auto-expire or anonymize.
    </p>
    <ul>
      <li>Delete individual results from <a href="/inference/results">/inference/results</a> or <a href="/llm/results">/llm/results</a>.</li>
      <li>Delete recipes from <a href="/inference/recipe">/inference/recipe</a> or <a href="/llm/recipe">/llm/recipe</a>.</li>
      <li>Account event logs (see <a href="#activity">Account event logging</a>) are kept for as long as your account exists and are removed when your account is deleted.</li>
      <li>To delete your account and all associated data, email <RevealEmail user="contact" host="webai.run" />.</li>
    </ul>
    <p>
      Site administrators may also delete any user data (accounts, results,
      recipes, or shared links) at their discretion — for example to remove
      spam, content that violates the terms of service, or at a user's
      request.
    </p>
  </section>

  <section id="rights">
    <h2>Your rights <a class="anchor" href="#rights" aria-label="Link to this section">§</a></h2>
    <p>
      Depending on where you live, you may have rights to access, correct,
      export, or delete the personal data we hold about you. We honour these
      requests for any signed-in user. Contact us at
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>

  <section id="children">
    <h2>Children <a class="anchor" href="#children" aria-label="Link to this section">§</a></h2>
    <p>
      The service is not directed at children under 18 (or the equivalent
      minimum age in your jurisdiction). We don't knowingly collect data from
      them. If you believe a child has signed up, contact us and we'll remove
      the account.
    </p>
  </section>

  <section id="changes">
    <h2>Changes <a class="anchor" href="#changes" aria-label="Link to this section">§</a></h2>
    <p>
      We'll update the "Last updated" date when we change this page. For
      material changes that affect how saved data is used, we'll notify
      signed-in users via the app.
    </p>
  </section>

  <section id="contact">
    <h2>Contact <a class="anchor" href="#contact" aria-label="Link to this section">§</a></h2>
    <p>
      For privacy questions or data-deletion requests:
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>
</article>
</div>

<style>
  /* Two-column layout at >=900px (TOC rail + article); single column below. */
  .legal-layout {
    max-width: 1100px;
    margin-inline: auto;
    padding: var(--space-3) var(--space-2);
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: var(--space-6);
    align-items: start;
  }

  .toc {
    position: sticky;
    top: var(--space-3);
    font-size: var(--text-xs);
  }
  .toc-summary {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    cursor: pointer;
    list-style: none;
    margin-bottom: var(--space-1);
  }
  .toc-summary::-webkit-details-marker { display: none; }
  .toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: toc;
  }
  .toc-list li {
    counter-increment: toc;
    margin-bottom: 4px;
  }
  .toc-list a {
    display: block;
    padding: 2px 0;
    color: var(--color-text-secondary);
    text-decoration: none;
    line-height: 1.4;
  }
  .toc-list a::before {
    content: counter(toc, decimal-leading-zero) "  ";
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .toc-list a:hover {
    color: var(--color-primary);
  }

  .legal {
    color: var(--color-text-primary);
    font-size: var(--text-base);
    line-height: 1.65;
    max-width: 720px;
    min-width: 0;
  }
  .legal-header {
    margin-bottom: var(--space-5);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
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
    margin-bottom: var(--space-5);
    scroll-margin-top: var(--space-4);
  }
  .legal h2 {
    font-size: var(--text-lg);
    font-weight: 600;
    margin: var(--space-3) 0 var(--space-1);
    color: var(--color-text-primary);
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
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
  .anchor {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    color: var(--color-text-muted);
    text-decoration: none;
    opacity: 0;
    transition: opacity var(--transition-base);
  }
  .legal h2:hover .anchor,
  .anchor:focus-visible {
    opacity: 1;
  }
  .anchor:hover {
    color: var(--color-primary);
  }
  .muted {
    color: var(--color-text-muted);
  }

  @media (max-width: 900px) {
    .legal-layout {
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }
    .toc {
      position: static;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-base);
      padding: var(--space-2);
    }
  }
</style>
