import { Button } from "@/components/button"

export function Participants() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Participant</h1>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 rounded-sm border-line accent-accent" />
        Consent received
      </label>
      <Button variant="secondary" className="self-start">Send reminder</Button>
    </section>
  )
}
