import { Button } from "@/components/button"

export function Home() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Interviews this week</h1>
      <div className="flex items-center gap-2">
        <Button>New interview</Button>
        <Button variant="secondary">Import notes</Button>
        <Button variant="ghost">Archive</Button>
      </div>
    </section>
  )
}
