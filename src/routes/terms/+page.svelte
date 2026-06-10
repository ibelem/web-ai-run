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

  <section>
    <h2>What this service is</h2>
    <p>
      Web AI Benchmark is a tool for measuring on-device AI inference 
      performance directly in your browser. You bring your own model
      (from HuggingFace or a local file) and the runtime executes it locally.
      We don't host model inference, generate content on your behalf, or
      operate as an AI service provider.
    </p>
  </section>

  <section>
    <h2>What you bring</h2>
    <p>
      You are responsible for the model files, prompts, and configurations you
      use, including their licenses and any third-party rights. We don't
      review or validate them. The runtime treats your inputs as opaque bytes
      and runs them in your browser.
    </p>
  </section>

  <section>
    <h2>Acceptable use</h2>
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

  <section>
    <h2>Accounts</h2>
    <p>
      Sign-in is via GitHub or Google OAuth. You are responsible for keeping
      your provider account secure. Don't share credentials. You can delete
      your account and associated data by emailing
      <RevealEmail user="contact" host="webai.run" />.
    </p>
  </section>

  <section>
    <h2>Third-party content</h2>
    <p>
      Nothing here grants you rights to third-party content (model weights,
      datasets, runtimes) you access through the app — those remain governed
      by their own licenses.
    </p>
  </section>

  <section>
    <h2>No warranty on benchmark numbers</h2>
    <p>
      Benchmarks run on your hardware in your browser using the runtimes you
      select. Numbers depend heavily on your CPU, GPU, drivers, browser
      version, system load, thermal state, and many other factors. We don't
      guarantee that results are reproducible across environments or
      representative of any specific deployment. Don't use them as the sole
      basis for production decisions without independent validation.
    </p>
  </section>

  <section>
    <h2>Service availability</h2>
    <p>
      The service is provided as-is, with no uptime guarantee. We may change,
      pause, or shut down the service or any part of it at any time. We'll
      give reasonable notice for disruptive changes when we can.
    </p>
  </section>

  <section>
    <h2>Limitation of liability</h2>
    <p>
      To the fullest extent permitted by law, the service is provided
      <strong>"AS IS"</strong> and without warranties of any kind, express or
      implied. We are not liable for any indirect, incidental, consequential,
      or special damages, lost profits, lost data, or business interruption
      arising out of your use of the service.
    </p>
  </section>

  <section>
    <h2>Changes to these terms</h2>
    <p>
      We may update these terms from time to time. The "Last updated" date
      reflects the most recent change. Continued use after a change means you
      accept the new terms.
    </p>
  </section>

  <section>
    <h2>Contact</h2>
    <p>
      Questions or concerns: <RevealEmail user="contact" host="webai.run" />.
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
  .muted {
    color: var(--color-text-muted);
  }
</style>
