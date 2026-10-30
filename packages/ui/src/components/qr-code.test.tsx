import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QRCode, qrSvg } from './qr-code.js';

describe('QRCode', () => {
  it('renders an SVG with dark modules and an accessible label', () => {
    render(<QRCode value="https://tiwa.app/e/party/rsvp" label="RSVP link QR" />);
    const figure = screen.getByRole('img', { name: 'RSVP link QR' });
    expect(figure.querySelector('svg')).toBeInTheDocument();
    expect(figure.querySelectorAll('rect').length).toBeGreaterThan(100);
  });

  it('qrSvg matches the component output for downloads', () => {
    const svg = qrSvg('https://tiwa.app/e/party/rsvp', 192);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg.match(/<rect/g)?.length).toBeGreaterThan(100);
    render(<QRCode value="https://tiwa.app/e/party/rsvp" />);
    const count = screen.getByRole('img').querySelectorAll('rect').length;
    expect(svg.match(/<rect/g)?.length).toBe(count);
  });
});
