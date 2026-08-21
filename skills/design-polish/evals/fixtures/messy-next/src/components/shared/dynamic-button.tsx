import * as React from 'react';

type Kind = 'primary' | 'ghost';

export function DynamicButton({
  kind,
  ...props
}: React.ComponentProps<'button'> & { kind: Kind }) {
  return <button className={`btn btn-${kind}`} {...props} />;
}
