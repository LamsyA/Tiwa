// Theme: follow system by default; Light/Dark/System choice stored in a
// cookie so the server renders the right theme with no flash (Frontend.md §2).

export const THEME_COOKIE = 'tiwa-theme';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];

export function parseThemeChoice(raw: string | undefined | null): ThemeChoice {
  return raw !== null && raw !== undefined && (CHOICES as string[]).includes(raw) ? (raw as ThemeChoice) : 'system';
}

/** What the server renders: explicit choice, or unset (CSS media query decides, script sets it pre-paint). */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme | undefined {
  if (choice === 'light' || choice === 'dark') return choice;
  return undefined;
}

export function themeCookieHeader(choice: ThemeChoice, maxAgeSeconds = 31536000): string {
  return `${THEME_COOKIE}=${choice}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

/**
 * Inline `<script>` for `<head>`: runs before first paint, sets
 * `data-theme` from the cookie (or the OS preference when System), so there
 * is no light→dark flash. Zero bundle cost (string, not a module).
 */
export const themeNoFlashScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)tiwa-theme=(light|dark|system)/);var c=m?m[1]:'system';var t=c==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c;document.documentElement.setAttribute('data-theme',t);var bg=t==='dark'?'#0b0b0f':'#ffffff';var m1=document.querySelector('meta[name="theme-color"]');if(m1)m1.setAttribute('content',bg);}catch(e){}})();`;
