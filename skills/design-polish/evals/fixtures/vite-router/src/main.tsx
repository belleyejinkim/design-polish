import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import "./index.css"
import { Shell } from "@/components/shell"
import { Home } from "@/pages/home"
import { Reports } from "@/pages/reports"
import { Participants } from "@/pages/participants"

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: "reports", element: <Reports /> },
      { path: "participants/:id", element: <Participants /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
