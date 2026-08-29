import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ELO_START, type EloPoint } from '@domain/statistics/elo';
import { asId, type MatchId, type TeamId } from '@models/index';

import { EloChart } from './EloChart';

function point(rating: number, at: string, index = 0): EloPoint {
  return {
    matchId: asId<MatchId>(`m${String(index)}`),
    at,
    rating,
    change: 0,
    opponentId: asId<TeamId>('other'),
    won: rating >= ELO_START,
  };
}

/** The drawn line, as pairs of numbers. */
function polyline(): { x: number; y: number }[] {
  const raw = document.querySelector('polyline')?.getAttribute('points') ?? '';
  return raw
    .split(' ')
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x ?? 0, y: y ?? 0 };
    });
}

/** Axis labels with the height each was drawn at. */
function axis(): { value: number; y: number }[] {
  return [...document.querySelectorAll('svg text')].map((node) => ({
    value: Number(node.textContent),
    y: Number(node.getAttribute('y')),
  }));
}

describe('EloChart', () => {
  it('draws nothing at all without a rated match', () => {
    const { container } = render(<EloChart points={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws one position per result', () => {
    render(
      <EloChart
        points={[
          point(1016, '2026-01-01T00:00:00.000Z', 0),
          point(1031, '2026-02-01T00:00:00.000Z', 1),
          point(1020, '2026-03-01T00:00:00.000Z', 2),
        ]}
      />,
    );

    expect(polyline()).toHaveLength(3);
  });

  /** A rating that went up must be drawn higher, which is upwards in SVG. */
  it('draws a better rating higher up', () => {
    render(
      <EloChart
        points={[
          point(1000, '2026-01-01T00:00:00.000Z', 0),
          point(1040, '2026-02-01T00:00:00.000Z', 1),
        ]}
      />,
    );

    const [start, end] = polyline();
    expect(end?.y).toBeLessThan(start?.y ?? 0);
  });

  /**
   * Two seasons apart has to look like two seasons apart, or the line says
   * something about form that the results do not.
   */
  it('spaces the points by when they happened', () => {
    render(
      <EloChart
        points={[
          point(1000, '2020-01-01T00:00:00.000Z', 0),
          point(1010, '2020-02-01T00:00:00.000Z', 1),
          point(1020, '2026-01-01T00:00:00.000Z', 2),
        ]}
      />,
    );

    const [a, b, c] = polyline();
    // The first two are a month apart, the last six years later.
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeLessThan((c?.x ?? 0) - (b?.x ?? 0));
  });

  /** Results carrying one timestamp say nothing about when, only about order. */
  it('spaces points evenly when every result shares a moment', () => {
    render(
      <EloChart
        points={[
          point(1000, '2026-01-01T00:00:00.000Z', 0),
          point(1010, '2026-01-01T00:00:00.000Z', 1),
          point(1020, '2026-01-01T00:00:00.000Z', 2),
        ]}
      />,
    );

    const [a, b, c] = polyline();
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeCloseTo((c?.x ?? 0) - (b?.x ?? 0));
  });

  /**
   * An axis label at a height that is not its own is worse than no axis: it
   * invites the reader to measure against the wrong line.
   */
  it('puts every axis label at the height of the value it names', () => {
    render(
      <EloChart
        points={[
          point(960, '2026-01-01T00:00:00.000Z', 0),
          point(1040, '2026-02-01T00:00:00.000Z', 1),
        ]}
      />,
    );

    const labels = axis();
    const heights = polyline().map((point) => point.y);

    /*
     * Text is positioned by its baseline, so every label sits a fixed nudge
     * below the height it names. That nudge is read off the one pairing which
     * cannot be wrong — the starting rating and the dashed line drawn at it —
     * and the others have to agree with it.
     */
    const dashed = Number(document.querySelector('svg line')?.getAttribute('y1'));
    const nudge = (labels.find((label) => label.value === ELO_START)?.y ?? 0) - dashed;

    expect(labels.find((label) => label.value === 1040)?.y).toBeCloseTo(
      Math.min(...heights) + nudge,
    );
    expect(labels.find((label) => label.value === 960)?.y).toBeCloseTo(
      Math.max(...heights) + nudge,
    );
  });

  it('names the starting rating once, not twice', () => {
    render(
      <EloChart
        points={[
          point(ELO_START, '2026-01-01T00:00:00.000Z', 0),
          point(1040, '2026-02-01T00:00:00.000Z', 1),
        ]}
      />,
    );

    expect(axis().filter((label) => label.value === ELO_START)).toHaveLength(1);
  });

  /** The picture is a summary; the numbers behind it must still be readable. */
  it('carries the figures for a reader who cannot see the line', () => {
    render(
      <EloChart
        points={[
          point(1016, '2026-01-01T00:00:00.000Z', 0),
          point(1031, '2026-02-01T00:00:00.000Z', 1),
        ]}
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('1016')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('1031');
  });

  it('names one date when everything happened on the same day', () => {
    render(
      <EloChart
        points={[
          point(1016, '2026-01-01T09:00:00.000Z', 0),
          point(1031, '2026-01-01T17:00:00.000Z', 1),
        ]}
      />,
    );

    // The table below carries the dates too; this is about the caption.
    const caption = document.querySelector('figcaption');
    expect(caption?.textContent).toBe('2026-01-01');
  });
});
