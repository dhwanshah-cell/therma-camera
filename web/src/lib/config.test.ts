import { afterEach, describe, expect, it } from 'vitest';
import { DEV_API_TOKEN } from '@robodog/shared';
import { clearSettings, getToken, mediaUrl, saveSettings } from './config';

describe('config', () => {
  afterEach(() => clearSettings());

  it('falls back to the development token when nothing is configured', () => {
    expect(getToken()).toBe(DEV_API_TOKEN);
  });

  it('prefers the runtime override from localStorage', () => {
    saveSettings({ token: 'secret-123' });
    expect(getToken()).toBe('secret-123');
  });

  it('appends the token to server-relative media paths', () => {
    expect(mediaUrl('/media/RoboDog/Thermal/Images/x.jpg')).toBe(`/media/RoboDog/Thermal/Images/x.jpg?token=${DEV_API_TOKEN}`);
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl('blob:abc')).toBe('blob:abc');
  });
});
