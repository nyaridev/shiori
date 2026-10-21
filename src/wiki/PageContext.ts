// The page being shown, for elements that list what the page knows (its children, contents, related pages).
import { createContext, useContext } from "react";
import type { Answer, PageData } from "../../shared/api.ts";
import type { Threads } from "../comments/useThreads.ts";

export interface PageInfo {
  wikiId: string;
  page: PageData;
  /** Answers to the page's questions, and how to send one. */
  answers: Answer[];
  answer: (question: string, choice: string | null, body: string) => Promise<void>;
  /** The owner only: hide a guest's answer from guests and the inbox, or show it again. */
  hideAnswer: (id: number, hidden: boolean) => Promise<void>;
  /** The page's comment threads (for the Discussion panel). */
  threads: Threads;
}

export const PageContext = createContext<PageInfo | null>(null);

export const usePage = () => useContext(PageContext);
