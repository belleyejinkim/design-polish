import type { ButtonHTMLAttributes } from "react"

// A const-map component: no cva, no clsx — the style is looked up by variant name.
const BASE = "inline-flex h-9 items-center justify-center rounded-ctl px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
const VARIANTS = {
  primary: "bg-accent text-white hover:bg-blue-700",
  secondary: "bg-accent-soft text-accent hover:bg-blue-200",
  ghost: "text-ink-soft hover:bg-gray-100",
} as const

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }

export function Button({ variant = "primary", className, ...props }: Props) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className ?? ""}`} {...props} />
}
