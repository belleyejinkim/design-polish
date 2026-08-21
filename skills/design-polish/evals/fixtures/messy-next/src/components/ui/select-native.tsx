import * as React from "react"

import { cn } from "@/lib/utils"

function SelectNative({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select-native"
      className={cn("h-9 rounded-md border px-3 text-sm", className)}
      {...props}
    >
      {children}
    </select>
  )
}

export { SelectNative }
