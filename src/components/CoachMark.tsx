import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto';
type Side = 'top' | 'bottom' | 'left' | 'right';

interface CoachMarkProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  title: string;
  description: string;
  placement?: Placement;
  ctaLabel?: string;
  onCta?: () => void;
  onDismiss: () => void;
  offset?: number;
  width?: number;
}

const DEFAULT_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
const ARROW_SIZE = 8;

export const CoachMark: React.FC<CoachMarkProps> = ({
  anchorRef,
  title,
  description,
  placement = 'auto',
  ctaLabel,
  onCta,
  onDismiss,
  offset = 14,
  width = DEFAULT_WIDTH,
}) => {
  const { t } = useTranslation('common');
  const resolvedCtaLabel = ctaLabel ?? t('coach.ok');
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: Side } | null>(null);
  const [ringRect, setRingRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const recalc = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor) {
      setPos(null);
      setRingRect(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Hide when anchor is outside the viewport (avoids pointing at empty space)
    const isOffscreen =
      rect.bottom < 0 || rect.top > viewportH || rect.right < 0 || rect.left > viewportW;
    if (isOffscreen) {
      setAnchorVisible(false);
      return;
    }
    setAnchorVisible(true);

    setRingRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });

    const tooltipH = tooltip?.offsetHeight || 120;
    const tooltipW = tooltip?.offsetWidth || width;

    let side: Side;
    if (placement === 'auto') {
      const spaceLeft = rect.left;
      const spaceRight = viewportW - rect.right;
      const spaceTop = rect.top;
      const spaceBottom = viewportH - rect.bottom;
      const maxSpace = Math.max(spaceLeft, spaceRight, spaceTop, spaceBottom);
      if (maxSpace === spaceLeft && spaceLeft >= tooltipW + offset) side = 'left';
      else if (maxSpace === spaceRight && spaceRight >= tooltipW + offset) side = 'right';
      else if (maxSpace === spaceTop && spaceTop >= tooltipH + offset) side = 'top';
      else side = 'bottom';
    } else {
      side = placement;
    }

    let top = 0;
    let left = 0;
    switch (side) {
      case 'top':
        top = rect.top - tooltipH - offset;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - tooltipW - offset;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.right + offset;
        break;
    }

    top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportH - tooltipH - VIEWPORT_MARGIN));
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportW - tooltipW - VIEWPORT_MARGIN));

    setPos({ top, left, side });
  }, [anchorRef, placement, offset, width]);

  // Scroll anchor into view on mount so coach mark never points at scrolled-out targets
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor) {
      try {
        anchor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // older browsers without options arg
        anchor.scrollIntoView();
      }
    }
    recalc();
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate on any layout-affecting event
  useEffect(() => {
    const handle = () => recalc();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [recalc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (!pos || !ringRect || !anchorVisible) {
    // Off-screen measurement placeholder so first layout has real dimensions
    return createPortal(
      <div
        ref={tooltipRef}
        style={{ position: 'fixed', top: -9999, left: -9999, width, zIndex: 10000 }}
        className="rounded-xl shadow-2xl bg-blue-600 p-3.5"
        aria-hidden
      >
        <h4 className="text-sm font-semibold mb-1">{title}</h4>
        <p className="text-xs leading-relaxed">{description}</p>
      </div>,
      document.body
    );
  }

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE * 2,
    transform: 'rotate(45deg)',
    background: 'rgb(37, 99, 235)', // blue-600
  };
  const arrow = (() => {
    switch (pos.side) {
      case 'top':
        return <span style={{ ...arrowStyle, left: '50%', bottom: -ARROW_SIZE, marginLeft: -ARROW_SIZE }} />;
      case 'bottom':
        return <span style={{ ...arrowStyle, left: '50%', top: -ARROW_SIZE, marginLeft: -ARROW_SIZE }} />;
      case 'left':
        return <span style={{ ...arrowStyle, top: '50%', right: -ARROW_SIZE, marginTop: -ARROW_SIZE }} />;
      case 'right':
        return <span style={{ ...arrowStyle, top: '50%', left: -ARROW_SIZE, marginTop: -ARROW_SIZE }} />;
    }
  })();

  const RING_PADDING = 6;

  return createPortal(
    <>
      {/* keyframes for the pulsing ring around the target element */}
      <style>{`
        @keyframes docfai-coach-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55); }
          70%  { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
      `}</style>

      {/* Pulsing highlight ring around the anchor */}
      <div
        style={{
          position: 'fixed',
          top: ringRect.top - RING_PADDING,
          left: ringRect.left - RING_PADDING,
          width: ringRect.width + RING_PADDING * 2,
          height: ringRect.height + RING_PADDING * 2,
          borderRadius: 10,
          border: '2px solid rgb(59, 130, 246)',
          pointerEvents: 'none',
          zIndex: 9998,
          animation: 'docfai-coach-pulse 1.8s ease-out infinite',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}
        aria-hidden
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={title}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width,
          zIndex: 10000,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 200ms ease-out, transform 200ms ease-out',
        }}
        className={cn(
          'rounded-xl shadow-2xl bg-blue-600 text-white px-3.5 py-3'
        )}
      >
        {arrow}
        <h4 className="text-sm font-semibold text-white leading-snug mb-1">{title}</h4>
        <p className="text-xs text-blue-100 leading-relaxed">{description}</p>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => {
              onCta?.();
              onDismiss();
            }}
            className="px-3 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
          >
            {resolvedCtaLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default CoachMark;
