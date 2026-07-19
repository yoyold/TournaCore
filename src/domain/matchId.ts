import { asId, type MatchId, type MatchPosition, type StageId } from '@models/index';

const SEPARATOR = '/';

/**
 * Builds a match identifier from its structural position.
 *
 * Deliberately deterministic rather than random. Regenerating a stage's
 * structure — after editing the best-of format, say — produces the same
 * identifiers, so results recorded earlier stay attached to their match. With
 * random identifiers this would need a reconciliation step between blueprint and
 * stored match, which is exactly the kind of code that breaks when it matters.
 *
 * The identifier is opaque to everything except this module. Nothing should
 * parse it; use the position on the match instead.
 */
export function makeMatchId(stageId: StageId, position: MatchPosition): MatchId {
  const parts: string[] = [stageId];

  if (position.groupIndex !== undefined) parts.push(`g${String(position.groupIndex)}`);
  parts.push(position.bracket ?? 'main');
  parts.push(`r${String(position.round)}`);
  parts.push(`m${String(position.indexInRound)}`);
  if (position.leg !== undefined) parts.push(`l${String(position.leg)}`);

  return asId<MatchId>(parts.join(SEPARATOR));
}
