import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/shared/card';
import { ChartLegend } from '@/components/shared/chart-legend';
import { Chip, Tag } from '@/components/shared/chip';
import { DynamicButton } from '@/components/shared/dynamic-button';

export const metadata: Metadata = { title: 'Dashboard' };

const orders = [
  { id: 'o-1', customer: 'Ada', status: 'paid' },
  { id: 'o-2', customer: 'Grace', status: 'pending' },
  { id: 'o-3', customer: 'Linus', status: 'paid' },
];

export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Tag>Beta</Tag>
      </div>

      <div className="rounded-xl bg-brand-soft p-4 text-sm">
        Welcome back. You have {orders.length} open orders.
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip>Status: paid</Chip>
      </div>

      <ul className="divide-y">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2 text-sm">
              {order.customer}
              <Tag>{order.status}</Tag>
            </span>
            <Button size="sm">View</Button>
          </li>
        ))}
      </ul>

      <div>
        <button className="rounded-lg bg-brand p-[18px] text-white">Create order</button>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Revenue</h2>
          <DynamicButton kind="primary">Sync</DynamicButton>
        </div>
        <ChartLegend />
      </Card>
    </section>
  );
}
