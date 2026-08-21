import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DangerLink } from '@/components/shared/button-presets';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Order {id}</h1>
        <Badge variant="destructive">Overdue</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Payment is 14 days late.</p>
      <div className="flex items-center gap-3">
        <Button variant="destructive">Cancel order</Button>
        <DangerLink>Report a problem</DangerLink>
      </div>
      <button className="rounded-[6px] border px-3 py-1.5 text-sm hover:bg-gray-50">
        Refresh
      </button>
    </section>
  );
}
