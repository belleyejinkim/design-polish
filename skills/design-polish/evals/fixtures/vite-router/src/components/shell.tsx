import { Link, Outlet } from "react-router"

export function Shell() {
  return (
    <div className="mx-auto max-w-4xl p-8 text-ink">
      <nav className="mb-8 flex items-center gap-4 text-sm">
        <Link to="/" className="font-semibold">Research79</Link>
        <Link to="/reports" className="text-ink-soft hover:text-ink">Reports</Link>
      </nav>
      <Outlet />
    </div>
  )
}
