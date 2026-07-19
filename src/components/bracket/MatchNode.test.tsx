import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { asId, now, type MatchId, type ParticipantId, type Team, type TeamId } from '@models/index';

import { MatchNode } from './MatchNode';

import type { ResolvedMatch } from '@domain/formats/types';

const team = (id: string, name: string, tag: string): Team => ({
  id: asId<TeamId>(id),
  name,
  tag,
  socials: [],
  archived: false,
  createdAt: now(),
  updatedAt: now(),
});

const TEAMS: Record<string, Team> = {
  p1: team('t1', 'Nova Collective', 'NOV'),
  p2: team('t2', 'Iron Meridian', 'IRM'),
};

const teamOf = (participantId: string): Team | undefined => TEAMS[participantId];

function match(overrides: Partial<ResolvedMatch> = {}): ResolvedMatch {
  return {
    id: asId<MatchId>('m1'),
    position: { bracket: 'winner', round: 0, indexInRound: 0 },
    format: { kind: 'bo', games: 3 },
    slotA: { kind: 'participant', participantId: asId<ParticipantId>('p1') },
    slotB: { kind: 'participant', participantId: asId<ParticipantId>('p2') },
    status: 'ready',
    isBye: false,
    ...overrides,
  };
}

describe('MatchNode', () => {
  it('shows both team names', () => {
    render(<MatchNode match={match()} teamOf={teamOf} />);

    expect(screen.getByText('Nova Collective')).toBeInTheDocument();
    expect(screen.getByText('Iron Meridian')).toBeInTheDocument();
  });

  it('shows the map score of a played match', () => {
    render(<MatchNode match={match()} score={{ a: 2, b: 1 }} teamOf={teamOf} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  /**
   * Regression guard. A stored result can survive on a match that later became a
   * bye — after the participant list changed, for instance. The engine ignores
   * it, and the display must too, rather than claiming maps were played against
   * an empty slot.
   */
  it('never shows a score on a bye, even when one is passed in', () => {
    render(
      <MatchNode
        match={match({ isBye: true, slotB: { kind: 'bye' }, status: 'walkover' })}
        score={{ a: 2, b: 1 }}
        teamOf={teamOf}
      />,
    );

    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getAllByText('Freilos').length).toBeGreaterThan(0);
  });

  it('labels an undetermined slot rather than leaving it blank', () => {
    render(
      <MatchNode
        match={match({ slotB: { kind: 'tbd', source: { kind: 'tbd' } }, status: 'pending' })}
        teamOf={teamOf}
      />,
    );

    expect(screen.getByText('Offen')).toBeInTheDocument();
  });

  it('states the match status in words, not only through colour', () => {
    render(
      <MatchNode
        match={match({
          status: 'completed',
          outcome: { winner: 'A', reason: 'played', decidedAt: now() },
        })}
        teamOf={teamOf}
      />,
    );

    expect(screen.getByText(/Beendet/)).toBeInTheDocument();
  });

  it('is not operable when it represents a bye', () => {
    const { container } = render(
      <MatchNode
        match={match({ isBye: true, slotB: { kind: 'bye' } })}
        teamOf={teamOf}
        onSelect={() => undefined}
      />,
    );

    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('is keyboard operable when selectable', () => {
    render(<MatchNode match={match()} teamOf={teamOf} onSelect={() => undefined} />);

    const node = screen.getByRole('button');
    expect(node).toHaveAttribute('tabindex', '0');
  });

  /**
   * The visible text sits in nested spans, several of them hidden, so without an
   * explicit label the node is an anonymous button — indistinguishable from the
   * dozen others in a bracket.
   */
  it('names the pairing for assistive technology', () => {
    render(<MatchNode match={match()} teamOf={teamOf} onSelect={() => undefined} />);

    const node = screen.getByRole('button', {
      name: /Nova Collective gegen Iron Meridian/i,
    });
    expect(node).toBeInTheDocument();
    expect(node.getAttribute('aria-label')).toContain('Bereit');
  });

  it('names an undetermined side rather than leaving a gap', () => {
    render(
      <MatchNode
        match={match({ slotB: { kind: 'tbd', source: { kind: 'tbd' } }, status: 'pending' })}
        teamOf={teamOf}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByRole('button', { name: /Nova Collective gegen Offen/i }),
    ).toBeInTheDocument();
  });
});
