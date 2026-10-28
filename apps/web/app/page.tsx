import en from '@/messages/en.json';

export default function Home() {
  return (
    <main className="bg-bg text-text mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-3xl font-bold">{en.app.name}</h1>
      <p className="text-lg">{en.app.tagline}</p>
      <p className="text-muted text-sm">{en.home.placeholderNote}</p>
    </main>
  );
}
