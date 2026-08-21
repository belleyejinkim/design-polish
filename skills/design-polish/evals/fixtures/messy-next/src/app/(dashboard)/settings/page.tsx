import type { Metadata } from 'next';

import { SettingsForm } from '@/components/forms/settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm />
    </section>
  );
}
