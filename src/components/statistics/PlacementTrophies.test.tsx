import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { asId, type TournamentId } from '@models/index';

import { PlacementTrophies } from './PlacementTrophies';

import type { Placement } from '@domain/statistics/teamStats';

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    tournamentId: asId<TournamentId>('t1'),
    tournamentName: 'Spring Cup',
    rank: 1,
    major: false,
    at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const show = (placements: Placement[]) =>
  render(
    <MemoryRouter>
      <PlacementTrophies placements={placements} />
    </MemoryRouter>,
  );

/** The rendered size of a trophy, from the classes that set it. */
const sizeOf = (link: HTMLElement): string =>
  [...link.classList].filter((name) => name.startsWith('h-') || name.startsWith('w-')).join(' ');

describe('PlacementTrophies', () => {
  it('shows nothing for a team that has never placed', () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one trophy per placement', () => {
    show([
      placement({ rank: 1 }),
      placement({ rank: 2, tournamentId: asId<TournamentId>('t2') }),
      placement({ rank: 3, tournamentId: asId<TournamentId>('t3') }),
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  /**
   * Colour is the obvious signal and the one a reader may not have, so every
   * trophy says in words which place it was and where.
   */
  it('names the place and the tournament, not just the metal', () => {
    show([placement({ rank: 2, tournamentName: '2018 World Championship' })]);
    expect(screen.getByText('2. Platz — 2018 World Championship')).toBeInTheDocument();
  });

  it('links each trophy to the tournament it was won at', () => {
    show([placement({ tournamentId: asId<TournamentId>('cup-7') })]);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tournaments/cup-7');
  });

  it('draws a world championship larger than the rest', () => {
    show([
      placement({ major: true }),
      placement({ major: false, tournamentId: asId<TournamentId>('t2') }),
    ]);

    const [major, ordinary] = screen.getAllByRole('link');
    expect(sizeOf(major!)).not.toBe(sizeOf(ordinary!));
    // Larger, not merely different.
    expect(sizeOf(major!)).toContain('h-11');
    expect(sizeOf(ordinary!)).toContain('h-7');
  });

  /** Gold, silver and bronze have to be told apart at a glance too. */
  it('colours each place differently', () => {
    show([
      placement({ rank: 1 }),
      placement({ rank: 2, tournamentId: asId<TournamentId>('t2') }),
      placement({ rank: 3, tournamentId: asId<TournamentId>('t3') }),
    ]);

    const colours = screen.getAllByRole('link').map((link) => link.className);
    expect(new Set(colours).size).toBe(3);
  });

  /** Two thirds from one tournament are two trophies, and React needs two keys. */
  it('copes with a shared rank', () => {
    show([
      placement({ rank: 3 }),
      placement({ rank: 3, tournamentId: asId<TournamentId>('t2'), tournamentName: 'Autumn Cup' }),
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
