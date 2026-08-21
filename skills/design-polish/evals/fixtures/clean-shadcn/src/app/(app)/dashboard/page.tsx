import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ExpenseRow } from "@/components/shared/expense-row"

export const metadata = { title: "Dashboard" }

const EXPENSES = [
  { id: "1", label: "Coffee", amount: "4.50" },
  { id: "2", label: "Train", amount: "12.00" },
  { id: "3", label: "Lunch", amount: "9.80" },
]

export default function Dashboard() {
  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
        <div className="flex items-center gap-2">
          <Input placeholder="Search expenses" className="w-56" />
          <Button>Add expense</Button>
        </div>
      </header>
      <ul className="divide-y divide-border rounded-lg border">
        {EXPENSES.map((e) => (
          <ExpenseRow key={e.id} label={e.label} amount={e.amount} />
        ))}
      </ul>
    </>
  )
}
