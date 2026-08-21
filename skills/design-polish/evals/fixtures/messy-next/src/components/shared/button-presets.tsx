import * as React from 'react';

import { Button } from '@/components/ui/button';

// Ad-hoc "brand" look: hardcoded hex instead of the primary token.
export const PrimaryButton = (props: React.ComponentProps<typeof Button>) => (
  <Button className="bg-[#222222] text-white hover:bg-[#333333]" {...props} />
);

export const DangerLink = (props: React.ComponentProps<typeof Button>) => (
  <Button variant="link" className="text-[#d93025]" {...props} />
);
