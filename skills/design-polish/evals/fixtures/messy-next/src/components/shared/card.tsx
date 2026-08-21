import * as React from 'react';

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border bg-background p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}
