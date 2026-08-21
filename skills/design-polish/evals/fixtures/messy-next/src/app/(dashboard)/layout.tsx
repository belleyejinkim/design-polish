import { Button } from '@/components/ui/button';
import { Toolbar } from '@/components/shared/toolbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <nav className="flex gap-1 rounded-lg bg-muted p-1">
          <Button variant="ghost">Overview</Button>
          <Button variant="ghost">Orders</Button>
          <Button variant="ghost">Settings</Button>
        </nav>
        <Toolbar />
      </div>
      {children}
    </div>
  );
}
