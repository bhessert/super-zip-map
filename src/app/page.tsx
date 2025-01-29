'use client';

import ZIPMap from '@/components/ZIPMap';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6">
      <div className="w-full max-w-7xl">
        <ZIPMap />
      </div>
    </main>
  );
}
