import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Design System' };

// Internal catalog: every Button variant x size and every Badge variant, once each.
export default function DesignSystemPage() {
  return (
    <section className="space-y-8">
      <h1 className="text-xl font-semibold">Design system</h1>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / default</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="default">Default</Button>
          <Button variant="default" size="sm">Small</Button>
          <Button variant="default" size="lg">Large</Button>
          <Button variant="default" size="icon" aria-label="Add">+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / destructive</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" size="default">Default</Button>
          <Button variant="destructive" size="sm">Small</Button>
          <Button variant="destructive" size="lg">Large</Button>
          <Button variant="destructive" size="icon" aria-label="Delete">-</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / outline</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="default">Default</Button>
          <Button variant="outline" size="sm">Small</Button>
          <Button variant="outline" size="lg">Large</Button>
          <Button variant="outline" size="icon" aria-label="Add">+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / secondary</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="default">Default</Button>
          <Button variant="secondary" size="sm">Small</Button>
          <Button variant="secondary" size="lg">Large</Button>
          <Button variant="secondary" size="icon" aria-label="Add">+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / ghost</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="default">Default</Button>
          <Button variant="ghost" size="sm">Small</Button>
          <Button variant="ghost" size="lg">Large</Button>
          <Button variant="ghost" size="icon" aria-label="Add">+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Button / link</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="link" size="default">Default</Button>
          <Button variant="link" size="sm">Small</Button>
          <Button variant="link" size="lg">Large</Button>
          <Button variant="link" size="icon" aria-label="Add">+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Badge</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </div>
    </section>
  );
}
