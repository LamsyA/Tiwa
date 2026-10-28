import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for Frontend.md §2: every text/background pair must reach
// WCAG AA (4.5 body, 3.0 large/UI). Parses the real tokens.css so token edits
// are checked, not a hardcoded copy.
function readBlock(css: string, selector: string): Record<string, string> {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 's').exec(css);
  if (!block?.[1]) throw new Error(`missing block: ${selector}`);
  const vars: Record<string, string> = {};
  for (const match of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

function luminance(hexColor: string): number {
  const hex = hexColor.replace(/^#/, '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');
const light = readBlock(css, ':root');
const dark = readBlock(css, String.raw`:root\[data-theme='dark'\]`);

// [name, fg var, bg var, minimum]
const pairs: Array<[string, string, string, number]> = [
  ['body light', 'text', 'bg', 4.5],
  ['muted light', 'text-muted', 'bg', 4.5],
  ['button text light', 'on-brand', 'brand-strong', 4.5],
  ['link light', 'brand-strong', 'bg', 4.5],
  ['success light', 'success', 'bg', 4.5],
  ['warning light', 'warning', 'bg', 4.5],
  ['danger light', 'danger', 'bg', 4.5],
  ['focus light', 'focus', 'bg', 3.0],
  ['body dark', 'text', 'bg', 4.5],
  ['muted dark', 'text-muted', 'bg', 4.5],
  ['button text dark', 'on-brand', 'brand-strong', 4.5],
  ['success dark', 'success', 'bg', 4.5],
  ['warning dark', 'warning', 'bg', 4.5],
  ['danger dark', 'danger', 'bg', 4.5],
  ['focus dark', 'focus', 'bg', 3.0],
];

type ModeVars = [mode: string, vars: Record<string, string>];
const modes: ModeVars[] = [
  ['light', light],
  ['dark', dark],
];

describe.each(modes)('tokens %s', (_mode, vars) => {
  it.each(pairs)('%s reaches AA', (name, fgVar, bgVar, minimum) => {
    const fg = vars[fgVar];
    const bg = vars[bgVar];
    expect(fg, `${fgVar} is hex`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(bg, `${bgVar} is hex`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ratio(fg as string, bg as string), `${name} contrast`).toBeGreaterThanOrEqual(minimum);
  });
});
