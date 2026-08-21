import * as React from 'react';

// Left over from the first prototype. Nothing imports this.
export function OldButton(props: React.ComponentProps<'button'>) {
  return (
    <button className="rounded-none bg-black px-4 py-2 text-white" {...props} />
  );
}
