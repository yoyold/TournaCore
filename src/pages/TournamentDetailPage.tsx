import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { BracketCanvas } from '@components/bracket/BracketCanvas';
import { MatchList } from '@components/match/MatchList';
import { MatchResultSheet } from '@components/match/MatchResultSheet';
import { StandingsTable } from '@components/standings/StandingsTable';
import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { ConfirmDialog } from '@components/ui/ConfirmDialog';
import { PageHeader } from '@components/ui/PageHeader';
import { isBracketFormat } from '@domain/formats/registry';
import { useDerivedTournament } from '@hooks/useDerivedTournament';
import { asId, type Match, type MatchId, type TournamentId } from '@models/index';
import { BracketArrangementControl } from '@pages/BracketArrangementControl';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { ResolvedMatch } from '@domain/formats/types';

/** A, B, C … for group captions. */
const groupLabel = (index: number): string => String.fromCharCode(65 + index);

export function TournamentDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const tournamentId = params.id ? asId<TournamentId>(params.id) : undefined;

  const tournament = useDataStore((s) => (tournamentId ? s.tournaments[tournamentId] : undefined));
  const hydrated = useDataStore((s) => s.hydrated);
  const matches = useDataStore((s) => s.matches);
  const saveMatch = useDataStore((s) => s.saveMatch);
  const removeTournament = useDataStore((s) => s.removeTournament);

  const { state, teamOf } = useDerivedTournament(tournamentId);
  const [selectedStage, setSelectedStage] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState<MatchId | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const storedMatches = useMemo(
    () => new Map(Object.entries(matches) as [MatchId, Match][]),
    [matches],
  );

  const stage = state?.stages[selectedStage];

  /**
   * How many places of this stage carry over, read from the following stage's
   * seeding rules. Showing it in the table is the difference between a list of
   * numbers and a table that tells you what is at stake.
   */
  const qualifyingPlaces = useMemo(() => {
    if (!state || !stage) return 0;
    const next = state.stages[selectedStage + 1];
    if (!next) return 0;

    let deepest = 0;
    for (const rule of next.stage.entrySeeding) {
      const source = rule.source;
      if (
        (source.kind === 'group_standings' || source.kind === 'stage_standings') &&
        source.stageId === stage.stage.id
      ) {
        deepest = Math.max(deepest, source.placeRange.to);
      }
    }
    return deepest;
  }, [state, stage, selectedStage]);

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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Pencil size={16} aria-hidden />}
              onClick={() => {
                void navigate(`/tournaments/${tournament.id}/edit`);
              }}
            >
              {t('common.edit')}
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => {
                setConfirmingDelete(true);
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        }
      />

      {confirmingDelete && (
        <ConfirmDialog
          title={t('tournaments.deleteTitle')}
          message={t('tournaments.deleteMessage', { name: tournament.name })}
          detail={t('tournaments.deleteDetail', {
            matches: Object.values(matches).filter((m) => m.tournamentId === tournament.id).length,
          })}
          confirmLabel={t('tournaments.deleteConfirm')}
          requireText={tournament.name}
          onCancel={() => {
            setConfirmingDelete(false);
          }}
          onConfirm={() => {
            void (async () => {
              await removeTournament(tournament.id);
              void navigate('/tournaments');
            })();
          }}
        />
      )}

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
          <div className="grid min-w-0 gap-4">
            {/*
              A bracket is the right picture for a knockout and the wrong one for
              a league: nothing advances, so there is no tree to draw. Leagues and
              groups get their table plus the fixture list instead.
            */}
            {isBracketFormat(stage.stage.format.kind) ? (
              <>
                <BracketArrangementControl stage={stage.stage} />
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
              </>
            ) : (
              <>
                {stage.groupStandings.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {stage.groupStandings.map((table, index) => (
                      <Card key={index}>
                        <CardBody className="p-0">
                          <StandingsTable
                            standings={table}
                            teamOf={teamOf}
                            qualifyingPlaces={qualifyingPlaces}
                            caption={t('standings.groupName', { index: groupLabel(index) })}
                          />
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardBody className="p-0">
                      <StandingsTable
                        standings={stage.standings}
                        teamOf={teamOf}
                        qualifyingPlaces={qualifyingPlaces}
                      />
                    </CardBody>
                  </Card>
                )}

                <MatchList
                  matches={stage.resolved.matches}
                  storedMatches={storedMatches}
                  teamOf={teamOf}
                  selectedMatchId={selectedMatch}
                  onSelectMatch={(match: ResolvedMatch) => {
                    setSelectedMatch((current) => (current === match.id ? undefined : match.id));
                  }}
                />
              </>
            )}
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
