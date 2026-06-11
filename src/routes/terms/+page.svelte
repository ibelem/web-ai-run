<!--
  Terms of Use

  Drafted as a snapshot of the current product. Marked TODOs are fields you
  must fill in (or remove the section) before treating this as a live legal
  document. Have someone with authority review before publishing.
-->
<script lang="ts">
  import RevealEmail from '$lib/components/RevealEmail.svelte';

  const updated = '2026-06-10';
</script>

<svelte:head>
  <title>Terms · Web AI Benchmark</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="legal-layout">
  <nav class="toc" aria-label="Table of contents">
    <details class="toc-details" open>
      <summary class="toc-summary">On this page</summary>
      <ol class="toc-list">
        <li><a href="#what-it-is">What this service is</a></li>
        <li><a href="#you-bring">What you bring</a></li>
        <li><a href="#acceptable-use">Acceptable use</a></li>
        <li><a href="#accounts">Accounts</a></li>
        <li><a href="#third-party">Third-party content</a></li>
        <li><a href="#warranty">No warranty on benchmark numbers</a></li>
        <li><a href="#availability">Service availability</a></li>
        <li><a href="#liability">Limitation of liability</a></li>
        <li><a href="#changes">Changes to these terms</a></li>
        <li><a href="#contact">Contact</a></li>
      </ol>
    </details>
  </nav>

<article class="legal">
  <header class="legal-header">
    <h1>Terms of Use</h1>
    <p class="muted">Last updated: {updated}</p>
  </header>

  <section>
    <p>
      By using Web AI Benchmark you agree to these terms. If you don't agree,
      please don't use the service.
    </p>
  </section>

  <section id="what-it-is">
    <h2>What this service is <a class="anchor" href="#what-it-is" aria-label="Link to this section">§</a></h2>
    <p>
      Web AI Benchmark is a tool for measuring on-device AI inference 
      performance directly in your browser. You bring your own model
      (from HuggingFace or a local file) and the runtime executes it locally.
      We don't host model inference, generate content on your behalf, or
      operate as an AI service provider.
    </p>
  </section>

  <section id="you-bring">
    <h2>What you bring <a class="anchor" href="#you-bring" aria-label="Link to this section">§</a></h2>
    <p>
      You are responsible for the model files, prompts, and configurations you
      use, including their licenses and any third-party rights. We don't
      review or validate them. The runtime treats your inputs as opaque bytes
      and runs them in your browser.
    </p>
  </section>

  <section id="acceptable-use">
    <h2>Acceptable use <a class="anchor" href="#acceptable-use" aria-label="Link to this section">§</a></h2>
    <p>When you sign in and save data, don't:</p>
    <ul>
      <li>Submit content to public-facing fields (display name, model identifiers, recipe names) that is unlawful, harassing, deceptive, or designed to impersonate others.</li>
      <li>Attempt to circumvent access controls or reach areas of the service you weren't granted permission to use.</li>
      <li>Probe for vulnerabilities, scrape data at high volume, or use automation that degrades the service for other users.</li>
      <li>Use benchmark numbers from this site in advertising, marketing, or promotional material — including comparative claims about competing products — without our prior written permission.</li>
      <li>Use the service for activities that violate applicable law where you live or where the service operates.</li>
    </ul>
    <p>We may suspend accounts that breach these terms.</p>
  </section>

  <section id="accounts">
    <h2>Accounts <a class="anchor" href="#accounts" aria-label="Link to this section">§</a></h2>
    <p>
      Sign-in is via GitHub or Google OAuth. You are responsible for keeping
      your provider account secure. Don't share credentials. You can delete
      your account and associated data by emailing
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>

  <section id="third-party">
    <h2>Third-party content <a class="anchor" href="#third-party" aria-label="Link to this section">§</a></h2>
    <p>
      Nothing here grants you rights to third-party content (model weights,
      datasets, runtimes) you access through the app — those remain governed
      by their own licenses.
    </p>
  </section>

  <section id="warranty">
    <h2>No warranty on benchmark numbers <a class="anchor" href="#warranty" aria-label="Link to this section">§</a></h2>
    <p>
      Benchmarks run on your hardware in your browser using the runtimes you
      select. Numbers depend heavily on your CPU, GPU, drivers, browser
      version, system load, thermal state, and many other factors. We don't
      guarantee that results are reproducible across environments or
      representative of any specific deployment. Don't use them as the sole
      basis for production decisions without independent validation.
    </p>
  </section>

  <section id="availability">
    <h2>Service availability <a class="anchor" href="#availability" aria-label="Link to this section">§</a></h2>
    <p>
      The service is provided as-is, with no uptime guarantee. We may change,
      pause, or shut down the service or any part of it at any time. We'll
      give reasonable notice for disruptive changes when we can.
    </p>
  </section>

  <section id="liability">
    <h2>Limitation of liability <a class="anchor" href="#liability" aria-label="Link to this section">§</a></h2>
    <p>
      To the fullest extent permitted by law, the service is provided
      <strong>"AS IS"</strong> and without warranties of any kind, express or
      implied. We are not liable for any indirect, incidental, consequential,
      or special damages, lost profits, lost data, or business interruption
      arising out of your use of the service.
    </p>
  </section>

  <section id="changes">
    <h2>Changes to these terms <a class="anchor" href="#changes" aria-label="Link to this section">§</a></h2>
    <p>
      We may update these terms from time to time. The "Last updated" date
      reflects the most recent change. Continued use after a change means you
      accept the new terms.
    </p>
  </section>

  <section id="contact">
    <h2>Contact <a class="anchor" href="#contact" aria-label="Link to this section">§</a></h2>
    <p>
      Questions or concerns: <RevealEmail user="contact" host="webai.run" />.
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
