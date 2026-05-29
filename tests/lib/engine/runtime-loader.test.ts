import { describe, it, expect } from 'vitest';
import { getOrtCdnUrl, getLiteRtCdnUrl } from '$lib/engine/runtime-loader';

describe('runtime-loader', () => {
  it('getOrtCdnUrl builds correct jsdelivr URL', () => {
    const url = getOrtCdnUrl('1.21.0');
    expect(url).toContain('jsdelivr');
    expect(url).toContain('1.21.0');
    expect(url).toContain('jspi');
  });

  it('getLiteRtCdnUrl builds correct URL', () => {
    const url = getLiteRtCdnUrl('1.1.0');
    expect(url).toContain('jsdelivr');
    expect(url).toContain('1.1.0');
  });
});
