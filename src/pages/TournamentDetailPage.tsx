import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { BracketCanvas } from '@components/bracket/BracketCanvas';
import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { useDerivedTournament } from '@hooks/useDerivedTournament';
import { asId, type MatchId, type TournamentId } from '@models/index';
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

  const { state, teamOf } = useDerivedTournament(tournamentId);
  const [selectedStage, setSelectedStage] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState<MatchId | undefined>(undefined);

  const storedMatches = useMemo(
    () => new Map(Object.entries(matches) as [MatchId, (typeof matches)[MatchId]][]),
    [matches],
  );

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

  const stage = state.stages[selectedStage];

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

      {stage && (
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
      )}
    </>
  );
}
