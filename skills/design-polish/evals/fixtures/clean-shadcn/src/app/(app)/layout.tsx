import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[200px_1fr] gap-8 px-6 py-10">
      <aside className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings">Settings</Link>
        </Button>
      </aside>
      <section className="flex flex-col gap-6">{children}</section>
    </div>
  )
}
