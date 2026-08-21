import type { InputHTMLAttributes } from "react"

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      <input className="h-9 rounded-ctl border border-line px-3 text-sm text-ink placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent" {...props} />
    </label>
  )
}
