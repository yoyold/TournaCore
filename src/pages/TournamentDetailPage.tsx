import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { BracketCanvas } from '@components/bracket/BracketCanvas';
import { MatchResultSheet } from '@components/match/MatchResultSheet';
import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { useDerivedTournament } from '@hooks/useDerivedTournament';
import { asId, type Match, type MatchId, type TournamentId } from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { ResolvedMatch } from '@domain/formats/types';

export function TournamentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const tournamentId = params.id ? asId<TournamentId>(params.id) : undefined;

  const tournament = useDataStore((s) => (tournamentId ? s.tournaments[tournamentId] : undefined));
  const hydrated = useDataStore((s) => s.hydrated);
  const matches = useDataStore((s) => s.matches);
  const saveMatch = useDataStore((s) => s.saveMatch);

  const { state, teamOf } = useDerivedTournament(tournamentId);
  const [selectedStage, setSelectedStage] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState<MatchId | undefined>(undefined);

  const storedMatches = useMemo(
    () => new Map(Object.entries(matches) as [MatchId, Match][]),
    [matches],
  );

  const stage = state?.stages[selectedStage];

  const selection = useMemo(() => {
    if (!stage || selectedMatch === undefined) return undefined;
    const resolved = stage.resolved.byId.get(selectedMatch);
    const structural = stage.structure.matches.find((m) => m.id === selectedMatch);
    if (!resolved || !structural) return undefined;
    return { resolved, structural };
  }, [stage, selectedMatch]);

  if (!hydrated) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;

  if (!tournament || !state) {
    return (
      <Card>
        <CardBody className="py-14 text-center text-sm text-fg-muted">
          {t('tournaments.notFound')}
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={tournament.name}
        subtitle={tournament.description ?? t(`tournaments.status.${tournament.status}`)}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-fg-secondary">
        <span>{t('tournaments.participantCount', { count: tournament.participants.length })}</span>
        {state.isComplete && (
          <span className="rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">
            {t('tournaments.completed')}
          </span>
        )}
      </div>

      {state.stages.length > 1 && (
        <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
          {state.stages.map((entry, index) => (
            <button
              key={entry.stage.id}
              type="button"
              role="tab"
              aria-selected={index === selectedStage}
              onClick={() => {
                setSelectedStage(index);
                setSelectedMatch(undefined);
              }}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
                index === selectedStage
                  ? 'border-accent text-accent'
                  : 'border-transparent text-fg-secondary hover:text-fg',
              )}
            >
              {entry.stage.name}
            </button>
          ))}
        </div>
      )}

      {/*
        Bracket and sheet side by side rather than the sheet floating over the
        bracket: the point of entering a result is watching the winner advance,
        so the thing that changes must stay in view.
      */}
      <div className={cn('grid gap-4', selection && 'lg:grid-cols-[1fr_380px]')}>
        {stage && (
          <div className="min-w-0">
            <BracketCanvas
              structure={stage.structure}
              matches={stage.resolved.matches}
              storedMatches={storedMatches}
              teamOf={teamOf}
              selectedMatchId={selectedMatch}
              onSelectMatch={(match: ResolvedMatch) => {
                setSelectedMatch((current) => (current === match.id ? undefined : match.id));
              }}
            />
          </div>
        )}

        {selection && stage && (
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line lg:max-h-[70vh]">
            <MatchResultSheet
              // Remounts on a different match, so the draft starts fresh.
              key={selection.resolved.id}
              match={selection.resolved}
              structural={selection.structural}
              stored={storedMatches.get(selection.resolved.id)}
              tournamentId={tournament.id}
              stageId={stage.stage.id}
              teamOf={teamOf}
              onSave={saveMatch}
              onClose={() => {
                setSelectedMatch(undefined);
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
