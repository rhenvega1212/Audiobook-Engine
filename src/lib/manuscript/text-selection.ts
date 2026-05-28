export type TextSelectionPayload = {
  lineId: string;
  start: number;
  end: number;
  selectedText: string;
  rect: DOMRect;
};

export function getTextSelectionInElement(
  container: HTMLElement,
  expectedFullText: string
): { start: number; end: number; selectedText: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const selectedText = sel.toString();
  if (!selectedText.trim()) return null;

  const startRange = document.createRange();
  startRange.selectNodeContents(container);
  startRange.setEnd(range.startContainer, range.startOffset);
  const start = startRange.toString().length;

  const endRange = document.createRange();
  endRange.selectNodeContents(container);
  endRange.setEnd(range.endContainer, range.endOffset);
  const end = endRange.toString().length;

  if (start >= end) return null;

  const slice = expectedFullText.slice(start, end);
  if (slice !== selectedText) {
    const trimmed = selectedText.trim();
    const idx = expectedFullText.indexOf(trimmed, Math.max(0, start - 2));
    if (idx >= 0 && trimmed.length > 0) {
      return { start: idx, end: idx + trimmed.length, selectedText: trimmed };
    }
    return null;
  }

  return { start, end, selectedText };
}
