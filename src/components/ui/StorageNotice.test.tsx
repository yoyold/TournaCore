import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { asId, now, type Tournament, type TournamentId } from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';
import { useStorageStore } from '@store/slices/storageSlice';

import { StorageNotice } from './StorageNotice';

function tournament(id: string): Tournament {
  return {
    id: asId<TournamentId>(id),
    name: 'Ruhm Cup',
    slug: id,
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'completed',
    participants: [],
    stageIds: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Puts the stores in a known state without touching storage. */
function given(options: {
  durability?: 'persisted' | 'best_effort' | 'unsupported';
  tournaments?: number;
  dismissed?: boolean;
}): void {
  useStorageStore.setState({
    ...(options.durability === undefined ? {} : { durability: options.durability }),
    noticeDismissed: options.dismissed ?? false,
  });

  useDataStore.setState({
    hydrated: true,
    tournaments: Object.fromEntries(
      Array.from({ length: options.tournaments ?? 1 }, (_, index) => {
        const entry = tournament(`t${String(index)}`);
        return [entry.id, entry];
      }),
    ),
  });
}

const show = () =>
  render(
    <MemoryRouter>
      <StorageNotice />
    </MemoryRouter>,
  );

beforeEach(() => {
  useStorageStore.setState({ durability: undefined, noticeDismissed: false });
  useDataStore.setState({ hydrated: false, tournaments: {} });
});

describe('StorageNotice', () => {
  it('warns while the browser may discard the archive', () => {
    given({ durability: 'best_effort' });
    show();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('says nothing once the browser has promised to keep it', () => {
    given({ durability: 'persisted' });
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * A warning on an empty application teaches people to ignore warnings, and
   * the first thing a new user should see is not a risk they do not yet carry.
   */
  it('says nothing while there is nothing to lose', () => {
    given({ durability: 'best_effort', tournaments: 0 });
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it('waits for the data to load before judging', () => {
    useStorageStore.setState({ durability: 'best_effort' });
    useDataStore.setState({ hydrated: false, tournaments: {} });
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing before the browser has been asked', () => {
    given({ tournaments: 1 });
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the one thing that actually protects the data', () => {
    given({ durability: 'best_effort' });
    show();
    expect(screen.getByRole('link', { name: 'Jetzt sichern' })).toHaveAttribute(
      'href',
      '/transfer',
    );
  });

  it('can be put away for the visit', async () => {
    given({ durability: 'best_effort' });
    show();

    await userEvent.click(screen.getByRole('button', { name: 'Hinweis ausblenden' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /** Dismissal is held in memory, so a reload brings the warning back. */
  it('is not silenced for good', () => {
    given({ durability: 'best_effort', dismissed: true });
    expect(useStorageStore.getState().noticeDismissed).toBe(true);

    // What a reload does: a fresh store, with nothing remembered.
    useStorageStore.setState({ noticeDismissed: false });
    show();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
