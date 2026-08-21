import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = { title: 'Messy' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="font-semibold">Messy</span>
          <button className="text-sm text-gray-500 hover:text-gray-900 focus-visible:focus-ring">
            Sign out
          </button>
        </header>
        <main className="px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
