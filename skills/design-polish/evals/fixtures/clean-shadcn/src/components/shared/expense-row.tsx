import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export function ExpenseRow({ label, amount }: { label: string; amount: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Checkbox aria-label={`Select ${label}`} />
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-sm tabular-nums text-muted-foreground">{amount}</span>
      <Button variant="ghost" size="sm">Edit</Button>
    </li>
  )
}
