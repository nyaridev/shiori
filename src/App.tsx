import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { Crash, SCREENS, Screen } from "./dev/Screens.tsx";
import { GuestGate, GuestHome } from "./guest/GuestGate.tsx";
import { Deck } from "./home/Deck.tsx";
import { BASE, isGuest } from "./lib/base.ts";
import { ErrorPage } from "./shell/ErrorPage.tsx";
import { ToolboxPage } from "./toolbox/ToolboxPage.tsx";
import { PageScrollbar, TooltipProvider } from "./ui/index.ts";
import { WikiLayout } from "./wiki/WikiLayout.tsx";

function Shell() {
  return (
    <>
      <Outlet />
      <PageScrollbar />
    </>
  );
}

const notFound = { path: "*", loader: () => Promise.reject(new Response("", { status: 404 })) };

const ownerRoutes = () =>
  createBrowserRouter([
    {
      element: <Shell />,
      errorElement: <ErrorPage />,
      children: [
        {
          // Errors in a page land here, inside the shell.
          errorElement: <ErrorPage />,
          children: [
            { path: "/", element: <Deck /> },
            { path: "/w/:wikiId/*", element: <WikiLayout /> },
            // The toolbox (the host's only): the app's design system and what pages can use, in a wiki's theme.
            { path: "/toolbox", element: <Navigate to="/" replace /> },
            { path: "/toolbox/:wikiId/:entry?", element: <ToolboxPage /> },
            { path: "/dev/ui", element: <Navigate to="/" replace /> },
            // Previews of the special screens (Screens.tsx); the error page and "not found" are real route errors.
            { path: "/dev/screens/error", element: <Crash /> },
            {
              path: "/dev/screens/:name",
              element: <Screen />,
              loader: ({ params }) =>
                SCREENS.some((s) => s.name === params.name && s.render)
                  ? null
                  : Promise.reject(new Response("", { status: 404 })),
            },
            notFound,
          ],
        },
      ],
    },
  ]);

// A guest (ADR-0003) gets the shared wiki and nothing else: no deck, no dev pages. The link's path is the base.
const guestRoutes = () =>
  createBrowserRouter(
    [
      {
        element: <Shell />,
        errorElement: <ErrorPage />,
        children: [
          {
            element: <GuestGate />,
            errorElement: <ErrorPage />,
            children: [
              { path: "/", element: <GuestHome /> },
              { path: "/w/:wikiId/*", element: <WikiLayout /> },
              notFound,
            ],
          },
        ],
      },
    ],
    { basename: BASE },
  );

const router = isGuest ? guestRoutes() : ownerRoutes();

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
