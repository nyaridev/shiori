import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { UiPage } from "./dev/UiPage.tsx";
import { Deck } from "./home/Deck.tsx";
import { ErrorPage } from "./shell/ErrorPage.tsx";
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
    errorElement: <ErrorPage />,
    children: [
      {
        // Errors in a page land here, so the desktop title bar stays.
        errorElement: <ErrorPage />,
        children: [
          { path: "/", element: <Deck /> },
          { path: "/w/:wikiId/*", element: <WikiLayout /> },
          { path: "/dev/ui", element: <UiPage /> },
          { path: "*", loader: () => Promise.reject(new Response("", { status: 404 })) },
        ],
      },
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
