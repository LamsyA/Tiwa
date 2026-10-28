import { describe, expect, it } from 'vitest';
import { parseThemeChoice, resolveTheme, themeCookieHeader, themeNoFlashScript, THEME_COOKIE } from './theme.js';

describe('theme choice', () => {
  it('parses known choices, defaults unknown/missing to system', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice(undefined)).toBe('system');
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('amoled')).toBe('system');
  });

  it('resolves explicit choices, leaves system to CSS + script', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBeUndefined();
  });

  it('builds a long-lived lax cookie', () => {
    expect(themeCookieHeader('dark')).toBe(`${THEME_COOKIE}=dark; Path=/; Max-Age=31536000; SameSite=Lax`);
  });

  it('no-flash script reads the cookie, falls back to the OS, sets data-theme', () => {
    expect(themeNoFlashScript).toContain('tiwa-theme');
    expect(themeNoFlashScript).toContain('prefers-color-scheme');
    expect(themeNoFlashScript).toContain('data-theme');
    expect(themeNoFlashScript).toContain('theme-color');
  });
});
