// Opens the image viewer from any picture in a page. Outside a wiki (the toolbox's reference) there's no viewer, and
// pictures fall back to their own dialog or stay plain.
import { createContext, useContext } from "react";

export interface Viewer {
  /** Show this picture (its server URL, as in the page) with the rest of the wiki's pictures around it. */
  open: (src: string) => void;
}

export const ViewerContext = createContext<Viewer | null>(null);

export const useViewer = () => useContext(ViewerContext);
