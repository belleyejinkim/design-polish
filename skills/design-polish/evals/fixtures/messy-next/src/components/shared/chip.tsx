import * as React from 'react';

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
      {children}
      <button aria-label="remove" className="rounded-full hover:bg-gray-200">
        ×
      </button>
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
      {children}
    </span>
  );
}
