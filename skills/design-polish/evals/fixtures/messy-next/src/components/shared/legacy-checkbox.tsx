import * as React from 'react';

// Pre-shadcn checkbox that never got migrated.
export function LegacyCheckbox(props: React.ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className="h-5 w-5 rounded border-gray-300"
      style={{ accentColor: '#1AA44D' }}
      {...props}
    />
  );
}
