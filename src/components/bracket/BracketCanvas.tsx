import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { computeBracketLayout } from '@domain/bracket/layout';
import { matchScore, type Match, type MatchId, type Team } from '@models/index';
import { cn } from '@utils/cn';

import { MatchNode } from './MatchNode';

import type { GeneratedStructure, ResolvedMatch } from '@domain/formats/types';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.15;

export interface BracketCanvasProps {
  structure: GeneratedStructure;
  matches: readonly ResolvedMatch[];
  /** Stored matches, used for the map scores. */
  storedMatches: ReadonlyMap<MatchId, Match>;
  teamOf: (participantId: string) => Team | undefined;
  onSelectMatch?: ((match: ResolvedMatch) => void) | undefined;
  selectedMatchId?: MatchId | undefined;
}

/**
 * Renders a bracket: absolutely positioned match nodes over an SVG connector layer.
 *
 * The split is deliberate. Pure SVG would make text, hover states and keyboard
 * focus awkward; pure DOM cannot draw the curved connectors that make a dense
 * bracket followable. Each layer does what it is good at.
 *
 * Zoom and pan are a CSS transform on the container, so neither recomputes the
 * layout — the geometry is fixed, only the viewport moves.
 */
export function BracketCanvas({
  structure,
  matches,
  storedMatches,
  teamOf,
  onSelectMatch,
  selectedMatchId,
}: BracketCanvasProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  // Mirrored in state because the cursor depends on it during render, and a ref
  // must not be read there.
  const [panning, setPanning] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const panState = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const layout = useMemo(() => computeBracketLayout(structure), [structure]);
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const adjustZoom = useCallback((delta: number) => {
    setZoom((current) => clamp(current + delta, MIN_ZOOM, MAX_ZOOM));
  }, []);

  /*
   * Panning by dragging the background. Pointer events rather than mouse events,
   * so a touch drag works without a second code path.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    const element = viewport.current;
    if (!element) return;

    panState.current = {
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
    };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = panState.current;
    const element = viewport.current;
    if (!state || !element) return;

    element.scrollLeft = state.left - (event.clientX - state.x);
    element.scrollTop = state.top - (event.clientY - state.y);
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    panState.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (layout.nodes.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center text-sm text-fg-muted">
        {t('bracket.empty')}
      </p>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-inset">
      <div className="absolute top-3 right-3 z-10 flex gap-1 rounded-[var(--radius-control)] border border-line bg-surface/90 p-1 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('bracket.zoomOut')}
          onClick={() => {
            adjustZoom(-ZOOM_STEP);
          }}
          icon={<ZoomOut size={16} aria-hidden />}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('bracket.zoomReset')}
          onClick={() => {
            setZoom(1);
          }}
          icon={<Maximize2 size={15} aria-hidden />}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('bracket.zoomIn')}
          onClick={() => {
            adjustZoom(ZOOM_STEP);
          }}
          icon={<ZoomIn size={16} aria-hidden />}
        />
      </div>

      <div
        ref={viewport}
        className="max-h-[70vh] overflow-auto"
        role="group"
        aria-label={t('bracket.label')}
      >
        <div
          className={cn('relative select-none', panning ? 'cursor-grabbing' : 'cursor-grab')}
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${String(zoom)})`,
            }}
          >
            <svg
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute inset-0"
              aria-hidden
            >
              {layout.connectors.map((connector) => {
                const source = byId.get(connector.from);
                // Highlight the path a decided result travelled along.
                const settled = source?.outcome !== undefined && !source.isBye;
                return (
                  <path
                    key={connector.id}
                    d={connector.path}
                    fill="none"
                    strokeWidth={settled ? 2 : 1.5}
                    stroke={
                      settled
                        ? 'var(--tc-winner-line)'
                        : connector.kind === 'loser'
                          ? 'var(--tc-border-strong)'
                          : 'var(--tc-connector)'
                    }
                    strokeDasharray={connector.kind === 'loser' ? '4 3' : undefined}
                    opacity={settled ? 0.85 : 1}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((node) => {
              const match = byId.get(node.matchId);
              if (!match) return null;

              const stored = storedMatches.get(node.matchId);

              return (
                <div
                  key={node.matchId}
                  className="absolute"
                  style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                >
                  <MatchNode
                    match={match}
                    score={stored ? matchScore(stored.games) : undefined}
                    teamOf={teamOf}
                    selected={selectedMatchId === node.matchId}
                    {...(onSelectMatch ? { onSelect: onSelectMatch } : {})}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
