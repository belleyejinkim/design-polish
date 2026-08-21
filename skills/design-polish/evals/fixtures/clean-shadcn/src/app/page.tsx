import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Home" }

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Ledger</h1>
      <p className="text-muted-foreground">Track expenses without the noise.</p>
      <div className="flex items-center gap-3">
        <Button asChild>
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings">Settings</Link>
        </Button>
      </div>
    </main>
  )
}
