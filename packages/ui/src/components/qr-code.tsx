import qrcode from 'qrcode-generator';
import * as React from 'react';

// QR code (Frontend.md §4): SVG output, theme-aware. The matrix comes from
// the dependency-free `qrcode-generator`; PNG/PDF downloads rasterise an
// identical standalone SVG client-side so every format encodes the same data.

export interface QRCodeProps {
  value: string;
  size?: number;
  /** Accessible label for the figure (defaults to the encoded value). */
  label?: string;
  className?: string;
}

interface DarkModule {
  x: number;
  y: number;
}

function darkModules(value: string): { count: number; modules: DarkModule[] } {
  const matrix = qrcode(0, 'M');
  matrix.addData(value);
  matrix.make();
  const count = matrix.getModuleCount();
  const modules: DarkModule[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (matrix.isDark(row, col)) modules.push({ x: col, y: row });
    }
  }
  return { count, modules };
}

/** Standalone SVG string (for PNG/PDF rasterisation); identical to <QRCode>. */
export function qrSvg(value: string, size: number): string {
  const { count, modules } = darkModules(value);
  const cell = size / count;
  const rects = modules
    .map(
      (module) =>
        `<rect x="${(module.x * cell).toFixed(2)}" y="${(module.y * cell).toFixed(2)}" width="${(cell + 0.02).toFixed(2)}" height="${(cell + 0.02).toFixed(2)}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="currentColor">${rects}</svg>`;
}

export function QRCode({ value, size = 192, label, className }: QRCodeProps) {
  const { count, modules } = React.useMemo(() => darkModules(value), [value]);
  const cell = size / count;
  return (
    <figure className={className} aria-label={label ?? value} role="img">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} fill="currentColor" className="h-auto w-full">
        {modules.map((module, index) => (
          <rect key={index} x={module.x * cell} y={module.y * cell} width={cell + 0.02} height={cell + 0.02} />
        ))}
      </svg>
    </figure>
  );
}
