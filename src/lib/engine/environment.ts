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
    os: os.name,
    os_version: os.version,
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
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') ?? '' };
  }
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: '' };
  }
  if (ua.includes('Android')) {
    const match = ua.match(/Android ([\d.]+)/);
    return { name: 'Android', version: match?.[1] ?? '' };
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
        return {
          vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        };
      }
    }
  } catch {}
  return { vendor: 'Unknown', renderer: 'Unknown' };
}
