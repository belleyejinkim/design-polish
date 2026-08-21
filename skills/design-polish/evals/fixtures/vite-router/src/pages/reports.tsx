import { Button } from "@/components/button"
import { Field } from "@/components/field"

export function Reports() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <form className="flex items-end gap-2">
        <Field label="Search" placeholder="Find a report" />
        <Button>Search</Button>
        {/* hand-written button: different radius and colour from the component */}
        <button className="h-9 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50">Export CSV</button>
      </form>
    </section>
  )
}
