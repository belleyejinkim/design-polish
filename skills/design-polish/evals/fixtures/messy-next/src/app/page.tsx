import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/shared/button-presets';
import { Tag } from '@/components/shared/chip';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage() {
  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <Badge>New</Badge>
        <Badge variant="secondary">v0.1</Badge>
        <Tag>Beta</Tag>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        A deliberately messy little app used as a scanner fixture.
      </p>
      <Button className="mt-4">Get started</Button>

      <div className="mt-8 space-y-3 rounded-md border p-4">
        <p className="text-sm font-medium">Ready to upgrade?</p>
        <PrimaryButton>Upgrade now</PrimaryButton>
      </div>

      <div className="mt-8 space-y-3 rounded-md border p-4">
        <p className="text-sm font-medium">Already have an account?</p>
        <Button className="w-full">Continue</Button>
      </div>
    </section>
  );
}
