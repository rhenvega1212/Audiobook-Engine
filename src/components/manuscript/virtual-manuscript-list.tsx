"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_ROW_HEIGHT = 136;
const OVERSCAN = 8;
/** Below this count, use native scroll (rows vary in height). */
const NATIVE_SCROLL_THRESHOLD = 220;

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
  scrollKey?: string | number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  rowHeight?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const prevScrollKeyRef = useRef<string | number | undefined>(undefined);
  const prevScrollToIndexRef = useRef<number | null | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [, bumpMeasure] = useState(0);

  const useNativeScroll = items.length <= NATIVE_SCROLL_THRESHOLD;

  const measure = useCallback(() => {
    const el = parentRef.current;
    if (el) setViewportHeight(el.clientHeight);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, items.length]);

  const getOffset = useCallback(
    (index: number) => {
      let sum = 0;
      for (let i = 0; i < index; i++) {
        sum += heightsRef.current.get(items[i]!.id) ?? rowHeight;
      }
      return sum;
    },
    [items, rowHeight]
  );

  const getTotalHeight = useCallback(() => {
    let sum = 0;
    for (const item of items) {
      sum += heightsRef.current.get(item.id) ?? rowHeight;
    }
    return sum;
  }, [items, rowHeight]);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const scrollKeyChanged = prevScrollKeyRef.current !== scrollKey;
    const scrollToIndexChanged = prevScrollToIndexRef.current !== scrollToIndex;
    prevScrollKeyRef.current = scrollKey;
    prevScrollToIndexRef.current = scrollToIndex;

    if (scrollToIndex != null && scrollToIndex >= 0) {
      if (!scrollToIndexChanged && !scrollKeyChanged) return;

      if (useNativeScroll) {
        if (scrollToIndex === 0) {
          el.scrollTop = 0;
          setScrollTop(0);
        } else {
          const child = el.children[scrollToIndex] as HTMLElement | undefined;
          if (child) {
            child.scrollIntoView({ block: "start", behavior: "auto" });
            setScrollTop(el.scrollTop);
          }
        }
        return;
      }

      el.scrollTop = getOffset(scrollToIndex);
      setScrollTop(el.scrollTop);
      return;
    }

    if (scrollKeyChanged) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [scrollToIndex, scrollKey, getOffset, useNativeScroll]);

  const onRowResize = useCallback((id: string, height: number) => {
    const prev = heightsRef.current.get(id);
    if (prev != null && Math.abs(prev - height) < 2) return;
    heightsRef.current.set(id, height);
    bumpMeasure((n) => n + 1);
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(top);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  if (useNativeScroll) {
    return (
      <div
        ref={parentRef}
        className={`overflow-y-auto overscroll-contain ${className}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((item, index) => (
          <div key={item.id}>{renderRow(item, index)}</div>
        ))}
      </div>
    );
  }

  const totalHeight = getTotalHeight();
  let startIndex = 0;
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const h = heightsRef.current.get(items[i]!.id) ?? rowHeight;
    if (acc + h > scrollTop - OVERSCAN * rowHeight) {
      startIndex = i;
      break;
    }
    acc += h;
  }

  let endIndex = startIndex;
  let visibleHeight = 0;
  const target = viewportHeight + OVERSCAN * 2 * rowHeight;
  while (endIndex < items.length && visibleHeight < target) {
    visibleHeight +=
      heightsRef.current.get(items[endIndex]!.id) ?? rowHeight;
    endIndex++;
  }

  const paddingTop = getOffset(startIndex);
  const paddingBottom = Math.max(0, totalHeight - getOffset(endIndex));

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto overscroll-contain ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
      onScroll={handleScroll}
    >
      <div style={{ paddingTop, paddingBottom }}>
        {items.slice(startIndex, endIndex).map((item, i) => {
          const index = startIndex + i;
          return (
            <MeasuredRow
              key={item.id}
              id={item.id}
              minHeight={rowHeight}
              onResize={onRowResize}
            >
              {renderRow(item, index)}
            </MeasuredRow>
          );
        })}
      </div>
    </div>
  );
}

function MeasuredRow({
  id,
  minHeight,
  onResize,
  children,
}: {
  id: string;
  minHeight: number;
  onResize: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) onResize(id, h);
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onResize, children]);

  return (
    <div ref={ref} style={{ minHeight }}>
      {children}
    </div>
  );
}
