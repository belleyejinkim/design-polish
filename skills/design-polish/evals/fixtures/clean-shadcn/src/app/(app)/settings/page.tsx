import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

export const metadata = { title: "Settings" }

export default function Settings() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <form className="flex max-w-md flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Display name
          <Input name="name" defaultValue="Yejin" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Monthly budget
          <Input name="budget" type="number" defaultValue="800" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="weekly" defaultChecked />
          Send a weekly summary
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="round" />
          Round amounts to whole units
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit">Save changes</Button>
          <Button type="button" variant="outline">Cancel</Button>
        </div>
      </form>
    </>
  )
}
