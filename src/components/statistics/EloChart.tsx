import { useTranslation } from 'react-i18next';

import { ELO_START, type EloPoint } from '@domain/statistics/elo';

/** Drawing area. Scaled by CSS, so these are proportions rather than pixels. */
const WIDTH = 640;
const HEIGHT = 180;
const PAD_X = 44;
const PAD_Y = 16;

/** Above this many results the dots merge into the line and only clutter it. */
const DOTS_BELOW = 40;

/**
 * How a team's rating moved over time.
 *
 * Positioned by date rather than by result number, so two seasons apart look
 * two seasons apart. That matters for reading a career: a team that climbed over
 * three years did something different from one that climbed over three weekends.
 *
 * The line is drawn against the rating everybody starts from, because a rating
 * on its own says nothing — 1043 is only meaningful next to the 1000 it grew
 * from.
 */
export function EloChart({ points }: { points: readonly EloPoint[] }) {
  const { t } = useTranslation();

  if (points.length === 0) return null;

  const ratings = points.map((point) => point.rating);
  const low = Math.min(ELO_START, ...ratings);
  const high = Math.max(ELO_START, ...ratings);

  // A flat career would divide by zero, and a line pinned to the top of the box
  // reads as a maximum rather than as no change.
  const headroom = Math.max((high - low) * 0.15, 8);
  const top = high + headroom;
  const bottom = low - headroom;

  const times = points.map((point) => Date.parse(point.at));
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span = last - first;

  const xOf = (index: number): number => {
    const inner = WIDTH - PAD_X - PAD_Y;
    /*
     * Results imported before dates were carried across all share one instant.
     * Spacing them evenly then says "we do not know when" rather than drawing
     * every point on top of the first.
     */
    const fraction =
      span > 0 ? ((times[index] ?? first) - first) / span : index / Math.max(points.length - 1, 1);
    return PAD_X + fraction * inner;
  };

  const yOf = (rating: number): number =>
    PAD_Y + ((top - rating) / (top - bottom)) * (HEIGHT - PAD_Y * 2);

  const line = points.map((point, index) => `${String(xOf(index))},${String(yOf(point.rating))}`);
  const latest = points[points.length - 1];
  const baseline = yOf(ELO_START);

  /*
   * Each label sits at the height of the value it names. Labelling the edges of
   * the drawing area instead would put numbers next to heights that are not
   * theirs, which is worse than no axis at all. Where the team never went below
   * the starting rating, the two labels coincide and only one is drawn.
   */
  const marks = [high, ELO_START, low]
    .map((value) => Math.round(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => ({ value, y: yOf(value) }));

  const from = (points[0]?.at ?? '').slice(0, 10);
  const to = (latest?.at ?? '').slice(0, 10);

  return (
    <figure className="grid gap-2">
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('teams.eloChartLabel', {
          count: points.length,
          rating: Math.round(latest?.rating ?? ELO_START),
        })}
      >
        <g className="text-fg-muted">
          <line
            x1={PAD_X}
            x2={WIDTH - PAD_Y}
            y1={baseline}
            y2={baseline}
            stroke="currentColor"
            strokeDasharray="4 4"
            strokeWidth={1}
            opacity={0.5}
          />
          {marks.map((mark) => (
            <text key={mark.value} x={0} y={mark.y + 4} fill="currentColor" fontSize={11}>
              {mark.value}
            </text>
          ))}
        </g>

        <g className="text-accent">
          <polyline
            points={line.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.length < DOTS_BELOW &&
            points.map((point, index) => (
              <circle
                key={point.matchId}
                cx={xOf(index)}
                cy={yOf(point.rating)}
                r={2.5}
                fill="currentColor"
              />
            ))}
          {latest !== undefined && (
            <circle cx={xOf(points.length - 1)} cy={yOf(latest.rating)} r={4} fill="currentColor" />
          )}
        </g>
      </svg>

      {/*
        The picture is a summary; the numbers behind it are what a screen reader
        needs, and they are small enough to carry in full.
      */}
      <table className="sr-only">
        <caption>{t('teams.eloChart')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('teams.eloColumn.date')}</th>
            <th scope="col">{t('teams.eloColumn.result')}</th>
            <th scope="col">{t('statistics.column.rating')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.matchId}>
              <td>{point.at.slice(0, 10)}</td>
              <td>{point.won ? t('teams.winShort') : t('teams.lossShort')}</td>
              <td>{Math.round(point.rating)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <figcaption className="flex justify-between text-xs text-fg-muted">
        <span>{from}</span>
        {to !== from && <span>{to}</span>}
      </figcaption>
    </figure>
  );
}
