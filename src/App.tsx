import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { UiPage } from "./dev/UiPage.tsx";
import { Deck } from "./home/Deck.tsx";
import { TitleBar } from "./shell/TitleBar.tsx";
import { TooltipProvider } from "./ui/index.ts";
import { WikiLayout } from "./wiki/WikiLayout.tsx";

function Shell() {
  return (
    <>
      <TitleBar />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Deck /> },
      { path: "/w/:wikiId/*", element: <WikiLayout /> },
      { path: "/dev/ui", element: <UiPage /> },
    ],
  },
]);

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
