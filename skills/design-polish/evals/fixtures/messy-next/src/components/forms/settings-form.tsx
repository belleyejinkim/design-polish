'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Radio } from '@/components/ui/radio';
import { SelectNative } from '@/components/ui/select-native';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LegacyCheckbox } from '@/components/shared/legacy-checkbox';

export function SettingsForm() {
  const [notifications, setNotifications] = React.useState(true);

  return (
    <form className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Profile</h2>
        <button className="rounded-[6px] border px-3 py-1.5 text-sm hover:bg-gray-50">
          Reset
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Display name
        </label>
        <div className="flex gap-2">
          <Input id="name" placeholder="Your name" />
          <Button>Save</Button>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Email</legend>
        <label className="flex items-center gap-2 text-sm">
          <LegacyCheckbox defaultChecked />
          Product updates
        </label>
        <label className="flex items-center gap-2 text-sm">
          <LegacyCheckbox />
          Weekly digest
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox id="marketing" />
          Marketing
        </label>
      </fieldset>

      <div className="flex items-center justify-between">
        <span className="text-sm">Push notifications</span>
        <Switch checked={notifications} onCheckedChange={setNotifications} />
      </div>

      <div className="space-y-2">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <Textarea id="bio" placeholder="A few words about you" />
      </div>

      <div className="space-y-2">
        <label htmlFor="tz" className="text-sm font-medium">
          Timezone
        </label>
        <SelectNative id="tz" defaultValue="utc">
          <option value="utc">UTC</option>
          <option value="kst">Asia/Seoul</option>
        </SelectNative>
      </div>

      <fieldset className="flex gap-4">
        <Radio name="theme" id="theme-light" label="Light" defaultChecked />
        <Radio name="theme" id="theme-dark" label="Dark" />
        <Radio name="theme" id="theme-system" label="System" />
      </fieldset>

      <Button variant="destructive">Delete account</Button>
    </form>
  );
}
