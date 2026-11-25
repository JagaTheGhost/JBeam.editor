import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * GlobalTooltip
 *
 * App-wide custom dark tooltip matching the viewport's `.tool-tooltip` style.
 * - Intercepts both `data-tooltip` and native `title` attributes across the entire app.
 * - Converts `title` -> `data-tooltip` on hover so the OS/browser never renders a
 *   duplicate native tooltip alongside a custom one.
 * - Portals into `document.body` with viewport edge clamping so tooltips are never
 *   clipped by sidebar splitters or `overflow: hidden` containers.
 */
export function GlobalTooltip() {
  const [tooltip, setTooltip] = useState(null); // { text, rect }
  const [coords, setCoords] = useState({ left: -9999, top: -9999, ready: false });
  const tipRef = useRef(null);
  const activeElRef = useRef(null);
  const showTimerRef = useRef(null);
  const lastClosedAtRef = useRef(0);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const hideNow = () => {
      clearShowTimer();
      if (activeElRef.current) {
        lastClosedAtRef.current = Date.now();
        activeElRef.current = null;
      }
      setTooltip(null);
      setCoords({ left: -9999, top: -9999, ready: false });
    };

    const findTooltipTarget = (startNode) => {
      let node = startNode;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.nodeType === 1) {
          // Promote any native `title` attribute to `data-tooltip` immediately
          // so the browser never shows a second native OS tooltip.
          if (node.hasAttribute('title')) {
            const titleVal = node.getAttribute('title');
            node.removeAttribute('title');
            if (titleVal && titleVal.trim() && !node.hasAttribute('data-tooltip')) {
              node.setAttribute('data-tooltip', titleVal);
            }
          }

          const text = node.getAttribute('data-tooltip');
          if (text && text.trim()) {
            // Viewport tool-shelf buttons render their own inline `.tool-tooltip`
            if (node.classList?.contains('blender-tool-btn') && node.querySelector('.tool-tooltip')) {
              return null;
            }
            return { el: node, text: text.trim() };
          }
        }
        node = node.parentElement;
      }
      return null;
    };

    const handleMouseOver = (e) => {
      const match = findTooltipTarget(e.target);
      if (!match) {
        if (activeElRef.current && (!e.target || !activeElRef.current.contains(e.target))) {
          hideNow();
        }
        return;
      }

      if (activeElRef.current === match.el) return;

      clearShowTimer();
      activeElRef.current = match.el;

      const recentlyOpen = Date.now() - lastClosedAtRef.current < 200;
      const delay = recentlyOpen ? 45 : 260;

      showTimerRef.current = setTimeout(() => {
        if (activeElRef.current !== match.el || !match.el.isConnected) return;
        const currentText = match.el.getAttribute('data-tooltip')?.trim() || match.text;
        if (!currentText) return;
        setCoords({ left: -9999, top: -9999, ready: false });
        setTooltip({
          text: currentText,
          rect: match.el.getBoundingClientRect()
        });
      }, delay);
    };

    const handleMouseOut = (e) => {
      if (!activeElRef.current) return;
      const related = e.relatedTarget;
      if (related && activeElRef.current.contains(related)) return;
      // Moving into a descendant or parent that doesn't contain activeEl
      if (!related || !activeElRef.current.contains(related)) {
        hideNow();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') hideNow();
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('mousedown', hideNow, true);
    document.addEventListener('scroll', hideNow, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', hideNow);

    return () => {
      clearShowTimer();
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('mousedown', hideNow, true);
      document.removeEventListener('scroll', hideNow, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', hideNow);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tipRef.current) return;
    const tipRect = tipRef.current.getBoundingClientRect();
    const { rect } = tooltip;
    const pad = 8;
    const gap = 6;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    let top = rect.bottom + gap;
    if (top + tipRect.height > window.innerHeight - pad) {
      const aboveTop = rect.top - tipRect.height - gap;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        top = Math.max(pad, window.innerHeight - tipRect.height - pad);
      }
    }

    setCoords({ left: Math.round(left), top: Math.round(top), ready: true });
  }, [tooltip]);

  if (!tooltip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      className={`app-global-tooltip ${coords.ready ? 'visible' : ''}`}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
    >
      {tooltip.text}
    </div>,
    document.body
  );
}

export default GlobalTooltip;
