// Shown instead of React Router's default error screen when a page throws while rendering.
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
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
    <div className="ld-error deck-scope">
      <section className="ld-error-card">
        <span className="ld-error-icon">
          <Icon name="danger" size={22} />
        </span>
        <p className="ld-error-kicker">Loredeck</p>
        <h1 className="ld-error-title">{title}</h1>
        <p className="ld-error-message">{message}</p>
        {import.meta.env.DEV && stack && (
          <details className="ld-error-details">
            <summary>Details</summary>
            <pre>{stack}</pre>
          </details>
        )}
        <div className="ld-error-actions">
          <Link to="/" reloadDocument className="ld-error-link">
            <Icon name="deck" size={16} />
            Back to the deck
          </Link>
          <Button variant="solid" icon="undo" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </section>
    </div>
  );
}
