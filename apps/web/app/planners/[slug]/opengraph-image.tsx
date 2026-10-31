import { ImageResponse } from 'next/og';
import en from '@/messages/en.json';
import { loadPublicProfile } from '@/components/marketplace/loader.js';

/** OG card for planner profiles (UF-13-3). */
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

export default async function PlannerOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = await loadPublicProfile(slug, 'PLANNER')
    .then(({ profile }) => `${profile.org.name} · ${profile.profile.city}`)
    .catch(() => 'Planner on Tiwa');
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#1a120b',
        color: '#fff8f0',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800 }}>{name}</div>
      <div style={{ fontSize: 32, marginTop: 16, opacity: 0.8 }}>{en.marketplace.ogTagline}</div>
    </div>,
    { ...size },
  );
}
