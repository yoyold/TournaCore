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
   * One step per result, whatever the calendar says.
   *
   * A rating changes when a match is played and at no other moment, so the gaps
   * between events carry nothing to draw. Spacing by date instead leaves a
   * season crushed into a corner with a long flat line beside it — and a whole
   * tournament imported at once stacked on a single vertical.
   */
  it('spaces the points evenly however far apart they were played', () => {
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
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeCloseTo((c?.x ?? 0) - (b?.x ?? 0));
  });

  /** A whole tournament imported at once must not land on one vertical line. */
  it('spreads results that all carry the same timestamp', () => {
    render(
      <EloChart
        points={[
          point(1000, '2026-01-01T00:00:00.000Z', 0),
          point(1010, '2026-01-01T00:00:00.000Z', 1),
          point(1020, '2026-01-01T00:00:00.000Z', 2),
        ]}
      />,
    );

    const xs = polyline().map((position) => position.x);
    expect(new Set(xs).size).toBe(3);
  });

  /**
   * The shape an imported archive actually has: four tournaments, each written
   * in one go and so carrying one timestamp for all of its results. Spaced by
   * date this drew four vertical lines joined by long flat runs, which says
   * nothing about the team and hides every result inside the verticals.
   */
  it('spreads an archive of tournaments that were each imported at once', () => {
    const days = [
      '2026-08-24T10:00:00.000Z',
      '2026-08-24T11:00:00.000Z',
      '2026-08-24T12:00:00.000Z',
      '2026-08-25T09:00:00.000Z',
    ];
    const archive = days.flatMap((at, tournament) =>
      Array.from({ length: 5 }, (_, index) =>
        point(1000 + index * 4 - tournament * 6, at, tournament * 5 + index),
      ),
    );

    render(<EloChart points={archive} />);

    const xs = polyline().map((position) => position.x);
    expect(xs).toHaveLength(20);
    // Every result gets its own place, none of them shared with another.
    expect(new Set(xs).size).toBe(20);

    // And the places are the same distance apart throughout, so no stretch of
    // the line is emptier than any other.
    const steps = xs.slice(1).map((x, index) => x - (xs[index] ?? 0));
    for (const step of steps) expect(step).toBeCloseTo(steps[0] ?? 0);
  });

  it('draws the line across the full width', () => {
    render(
      <EloChart
        points={[
          point(1000, '2026-01-01T00:00:00.000Z', 0),
          point(1010, '2026-02-01T00:00:00.000Z', 1),
          point(1020, '2026-03-01T00:00:00.000Z', 2),
        ]}
      />,
    );

    const xs = polyline().map((position) => position.x);
    const viewBox = document.querySelector('svg')?.getAttribute('viewBox')?.split(' ') ?? [];
    const width = Number(viewBox[2]);

    expect(Math.min(...xs)).toBeLessThan(width * 0.1);
    expect(Math.max(...xs)).toBeGreaterThan(width * 0.9);
  });

  /** Tall enough to read, short enough not to dominate the profile. */
  it('is drawn wide and flat', () => {
    render(<EloChart points={[point(1000, '2026-01-01T00:00:00.000Z', 0)]} />);

    const viewBox = document.querySelector('svg')?.getAttribute('viewBox')?.split(' ') ?? [];
    expect(Number(viewBox[2]) / Number(viewBox[3])).toBeGreaterThan(5);
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
