import * as React from "react"

function Radio({
  label,
  id,
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input type="radio" id={id} className="size-4 accent-brand" {...props} />
      {label}
    </label>
  )
}

export { Radio }
