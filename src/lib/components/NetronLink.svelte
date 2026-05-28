<script lang="ts">
  interface Props {
    hfModelId: string;
    filePath: string;
    size?: number;
  }
  let { hfModelId, filePath, size = 15 }: Props = $props();
  const href = `https://ibelem.github.io/netron/?url=https://huggingface.co/${hfModelId}/resolve/main/${filePath}`;
</script>

<a
  class="netron-link"
  {href}
  target="_blank"
  rel="noopener noreferrer"
  title="View in Netron"
  aria-label="View {filePath} in Netron"
  onclick={(e) => e.stopPropagation()}
>
  <svg
    class="netron-icon"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <circle class="logo-stroke" cx="512" cy="512" r="431" fill="none" stroke-width="32"></circle>
    <circle class="logo-border" cx="512" cy="512" r="450" fill="none" stroke-width="6"></circle>
    <circle class="logo-border" cx="512" cy="512" r="412" fill="none" stroke-width="6"></circle>
    <line class="logo-stroke" x1="296" y1="392" x2="540" y2="280" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="632" x2="540" y2="280" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="392" x2="540" y2="435" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="632" x2="540" y2="435" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="392" x2="540" y2="590" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="632" x2="540" y2="590" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="392" x2="540" y2="744" stroke-width="12"></line>
    <line class="logo-stroke" x1="296" y1="632" x2="540" y2="744" stroke-width="12"></line>
    <line class="logo-stroke" x1="540" y1="280" x2="785" y2="512" stroke-width="12"></line>
    <line class="logo-stroke" x1="540" y1="590" x2="785" y2="512" stroke-width="12"></line>
    <line class="logo-stroke" x1="540" y1="435" x2="785" y2="512" stroke-width="12"></line>
    <line class="logo-stroke" x1="540" y1="744" x2="785" y2="512" stroke-width="12"></line>
    <g transform="translate(296, 392)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(296, 632)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(540, 280)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(540, 435)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(540, 590)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(540, 744)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
    <g transform="translate(785, 512)">
      <circle class="logo-fill" cx="0" cy="0" r="51"></circle>
      <circle class="logo-border" cx="0" cy="0" r="51" fill="none" stroke-width="6"></circle>
    </g>
  </svg>
</a>

<style>
  .netron-link {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.9;
    transition: opacity var(--transition-base);
    line-height: 0;
    pointer-events: auto;
  }

  .netron-link:hover {
    opacity: 1;
  }

  .logo-stroke {
    stroke: #444444;
  }

  .logo-border {
    stroke: #444444;
  }

  .logo-fill {
    fill: #444444;
  }

  :global([data-theme="dark"]) .netron-link .logo-stroke,
  :global([data-theme="dark"]) .netron-link .logo-border {
    stroke: #ffffff;
  }

  :global([data-theme="dark"]) .netron-link .logo-fill {
    fill: #ffffff;
  }
</style>
