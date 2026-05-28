"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_ROW_HEIGHT = 92;
const OVERSCAN = 6;

export function VirtualManuscriptList<T extends { id: string }>({
  items,
  scrollToIndex,
  scrollKey,
  renderRow,
  className = "",
  rowHeight = DEFAULT_ROW_HEIGHT,
}: {
  items: T[];
  scrollToIndex?: number | null;
  /** Bumps scroll even when index stays 0 (e.g. chapter change) */
  scrollKey?: string | number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  rowHeight?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const measure = useCallback(() => {
    const el = parentRef.current;
    if (el) setViewportHeight(el.clientHeight);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = scrollToIndex * rowHeight;
    setScrollTop(el.scrollTop);
  }, [scrollToIndex, scrollKey, rowHeight]);

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - OVERSCAN
  );
  const visibleCount =
    Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const paddingTop = startIndex * rowHeight;
  const paddingBottom = Math.max(0, (items.length - endIndex) * rowHeight);

  const visible = items.slice(startIndex, endIndex);

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ paddingTop, paddingBottom }}>
        {visible.map((item, i) => (
          <div key={item.id} style={{ minHeight: rowHeight }}>
            {renderRow(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
