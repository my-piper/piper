import { Node } from "src/models/node";
import { Languages } from "src/enums/languages";
import { getLabel } from "src/utils/i18n";

/**
 * Catalog nodes matching `query`, best first: an exact title, then a title
 * that starts with it, then one with a word that starts with it, then any
 * title, package or tag containing it.
 */
export function rankNodes(nodes: Node[], query: string, language: Languages) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const scored: { node: Node; score: number; title: string }[] = [];
  for (const node of nodes) {
    const title = (getLabel(node.title, language) ?? "").toLowerCase();
    const extra = [
      node.packageTitle,
      node.package,
      ...(node.tags ?? []).map((t) => getLabel(t, language)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score =
      title === q
        ? 0
        : title.startsWith(q)
          ? 1
          : title.split(/[\s_\-/]+/).some((w) => w.startsWith(q))
            ? 2
            : title.includes(q)
              ? 3
              : extra.includes(q)
                ? 4
                : null;
    if (score !== null) {
      scored.push({ node, score, title });
    }
  }
  return scored
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .map(({ node }) => node);
}

const RECENT_KEY = "piper.recent-nodes";
const RECENT_LIMIT = 5;

/** Ids of the nodes this browser added last, newest first. */
export function recentNodes(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberNode(id: string) {
  const ids = [id, ...recentNodes().filter((r) => r !== id)].slice(
    0,
    RECENT_LIMIT,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Storage is a convenience; a blocked one only loses the recent list.
  }
}
