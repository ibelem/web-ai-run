import type { EnvironmentInfo } from './types';

export async function detectEnvironment(): Promise<EnvironmentInfo> {
  const ua = navigator.userAgent;

  const browser = await detectBrowser(ua);
  const os = detectOS(ua);
  const gpu = await detectGPU();

  return {
    cpu: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : 'Unknown',
    gpu: gpu.renderer,
    gpu_vendor: gpu.vendor,
    os: os.name && os.version ? `${os.name} ${os.version}` : os.name,
    browser: browser.name,
    browser_version: browser.version,
    memory_gb: (navigator as any).deviceMemory ?? 0,
    thread_count: navigator.hardwareConcurrency ?? 1,
  };
}

async function detectBrowser(ua: string): Promise<{ name: string; version: string }> {
  if ((navigator as any).userAgentData) {
    try {
      const uaData = await (navigator as any).userAgentData.getHighEntropyValues(['fullVersionList']);
      let browser = { name: '', version: '' };
      let chromium = { name: '', version: '' };

      for (const entry of uaData.fullVersionList ?? []) {
        const brand = entry.brand.toLowerCase();
        if (brand.includes('brand')) continue;
        if (brand.includes('chromium')) {
          chromium = { name: 'Chromium', version: entry.version };
        } else {
          browser = { name: entry.brand, version: entry.version };
        }
      }

      if (browser.name) return browser;
      if (chromium.name) return chromium;
    } catch {}
  }

  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { name: 'Edge', version: match?.[1] ?? '' };
  }
  if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { name: 'Chrome', version: match?.[1] ?? '' };
  }
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return { name: 'Firefox', version: match?.[1] ?? '' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/);
    return { name: 'Safari', version: match?.[1] ?? '' };
  }
  return { name: 'Unknown', version: '' };
}

function detectOS(ua: string): { name: string; version: string } {
  if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    return { name: 'Windows', version: match?.[1] ?? '' };
  }
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
    const match = ua.match(/CPU(?:\s+iPhone)?\s+OS\s+([\d_]+)/);
    return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') ?? '' };
  }
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') ?? '' };
  }
  if (ua.includes('Android')) {
    const match = ua.match(/Android ([\d.]+)/);
    return { name: 'Android', version: match?.[1] ?? '' };
  }
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: '' };
  }
  return { name: 'Unknown', version: '' };
}

async function detectGPU(): Promise<{ vendor: string; renderer: string }> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        const rawVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string;
        return {
          vendor: rawVendor,
          renderer: cleanGPURenderer(raw),
        };
      }
    }
  } catch {}
  return { vendor: 'Unknown', renderer: 'Unknown' };
}

function cleanGPURenderer(raw: string): string {
  let s = raw.trim();
  let angleVendor = '';

  // ANGLE (Vendor, Renderer, Backend) — extract middle renderer part and remember vendor
  // e.g. "ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (32GB) (0x7D51) D3D11 vs_5_0 ps_5_0, D3D11)"
  // e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)"
  // e.g. "ANGLE (AMD, ANGLE (AMD, Radeon RX 6800 XT), D3D11)"
  // e.g. "ANGLE (Qualcomm, Adreno (TM) 750, OpenGL ES 3.2)"
  const angleMatch = s.match(/^ANGLE\s*\(([^,]+),\s*(.+),\s*[^,]+\)$/);
  if (angleMatch) {
    angleVendor = angleMatch[1].trim();
    s = angleMatch[2].trim();
  }

  // Nested ANGLE: "ANGLE (AMD, Radeon RX 6800 XT)" → "Radeon RX 6800 XT"
  const nestedAngle = s.match(/^ANGLE\s*\([^,]+,\s*(.+)\)$/);
  if (nestedAngle) {
    s = nestedAngle[1].trim();
  }

  // Apple Metal: "ANGLE Metal Renderer: Apple M2 Pro" → "Apple M2 Pro"
  s = s.replace(/^ANGLE Metal Renderer:\s*/i, '');

  // Remove hex device IDs: (0x00007D51)
  s = s.replace(/\(0x[0-9a-fA-F]+\)/g, '');

  // Remove D3D backend noise: "Direct3D11 vs_5_0 ps_5_0", "Direct3D11 Feature Level 11_0"
  s = s.replace(/Direct3D\d+[\s\w_.,-]*/gi, '');

  // Remove OpenGL/ES version strings: "OpenGL ES 3.0", "OpenGL 4.6.0"
  s = s.replace(/OpenGL(?:\s+ES)?[\d. ]*/gi, '');

  // Remove "OpenGL Engine" suffix (macOS drivers)
  s = s.replace(/\bOpenGL\s+Engine\b/gi, '');

  // Remove trademark symbols: (R), (TM), ®, ™
  s = s.replace(/\(R\)/gi, '').replace(/\(TM\)/gi, '').replace(/[®™]/g, '');

  // NVIDIA Linux: strip "/PCIe/SSE2" suffix
  s = s.replace(/\/PCIe.*$/i, '');

  // Remove redundant "GPU" word and VRAM size like "(32GB)", "(16GB)"
  s = s.replace(/\b\d+GB\b/gi, '').replace(/\bGPU\b/g, '');

  // Collapse empty parens and extra whitespace
  s = s.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();

  // Strip trailing punctuation
  s = s.replace(/[,/\\]+$/, '').trim();

  // Prepend vendor if the cleaned string doesn't already include it
  // e.g. "Adreno 750" → "Qualcomm Adreno 750", "Radeon RX 6800 XT" → "AMD Radeon RX 6800 XT"
  if (angleVendor && s && !s.toLowerCase().startsWith(angleVendor.toLowerCase())) {
    s = `${angleVendor} ${s}`;
  }

  return s || raw;
}
