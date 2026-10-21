// Shown instead of React Router's default error screen when a page throws while rendering.
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { isGuest } from "../lib/base.ts";
import { Button, Icon } from "../ui/index.ts";
import "./error.css";

function describe(error: unknown): { title: string; message: string; stack?: string } {
  if (isRouteErrorResponse(error)) {
    return error.status === 404
      ? { title: "Nothing here", message: "This page doesn't exist." }
      : { title: `Error ${error.status}`, message: error.statusText || "The request failed." };
  }
  if (error instanceof Error) return { title: "Something broke", message: error.message, stack: error.stack };
  return { title: "Something broke", message: String(error) };
}

export function ErrorPage() {
  const { title, message, stack } = describe(useRouteError());
  return (
    <div className="sh-error deck-scope">
      <section className="sh-error-card">
        <span className="sh-error-icon">
          <Icon name="danger" size={22} />
        </span>
        <p className="sh-error-kicker">Shiori</p>
        <h1 className="sh-error-title">{title}</h1>
        <p className="sh-error-message">{message}</p>
        {import.meta.env.DEV && stack && (
          <details className="sh-error-details">
            <summary>Details</summary>
            <pre>{stack}</pre>
          </details>
        )}
        <div className="sh-error-actions">
          <Link to="/" reloadDocument className="sh-error-link">
            <Icon name="deck" size={16} />
            {isGuest ? "Back to the wiki" : "Back to the deck"}
          </Link>
          <Button variant="solid" icon="undo" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </section>
    </div>
  );
}
