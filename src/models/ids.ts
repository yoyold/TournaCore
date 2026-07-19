import { nanoid } from 'nanoid';

/**
 * Branded identifier types.
 *
 * All identifiers are strings at runtime, but the brand makes them mutually
 * incompatible at compile time. Passing a TeamId where a MatchId is expected
 * becomes a type error rather than a lookup that silently returns undefined.
 *
 * This matters here more than in most applications: the domain resolves
 * references between six entity types, and a mixed-up identifier would surface
 * as a mysteriously empty bracket rather than a crash.
 */
declare const brand: unique symbol;

type Branded<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type GameId = Branded<string, 'GameId'>;
export type MapId = Branded<string, 'MapId'>;
export type TeamId = Branded<string, 'TeamId'>;
export type PlayerId = Branded<string, 'PlayerId'>;
export type RosterEntryId = Branded<string, 'RosterEntryId'>;
export type AssetId = Branded<string, 'AssetId'>;
export type TournamentId = Branded<string, 'TournamentId'>;
export type ParticipantId = Branded<string, 'ParticipantId'>;
export type StageId = Branded<string, 'StageId'>;
export type SeedingRuleId = Branded<string, 'SeedingRuleId'>;
export type MatchId = Branded<string, 'MatchId'>;
export type GameResultId = Branded<string, 'GameResultId'>;

/** Every branded identifier in the model. */
export type AnyId =
  | GameId
  | MapId
  | TeamId
  | PlayerId
  | RosterEntryId
  | AssetId
  | TournamentId
  | ParticipantId
  | StageId
  | SeedingRuleId
  | MatchId
  | GameResultId;

/*
 * Named factories rather than one generic `newId<T>()`.
 *
 * The generic version reads worse at the call site and, more importantly, lets
 * an unannotated target silently infer the wrong brand. `newTeamId()` cannot be
 * mistaken for anything else.
 *
 * No cast is needed: nanoid is declared as `nanoid<Type extends string>(): Type`,
 * so the branded return type is inferred from the annotation. The brand exists
 * only at compile time; the runtime value is an ordinary random string.
 */
export const newGameId = (): GameId => nanoid();
export const newMapId = (): MapId => nanoid();
export const newTeamId = (): TeamId => nanoid();
export const newPlayerId = (): PlayerId => nanoid();
export const newRosterEntryId = (): RosterEntryId => nanoid();
export const newAssetId = (): AssetId => nanoid();
export const newTournamentId = (): TournamentId => nanoid();
export const newParticipantId = (): ParticipantId => nanoid();
export const newStageId = (): StageId => nanoid();
export const newSeedingRuleId = (): SeedingRuleId => nanoid();
export const newGameResultId = (): GameResultId => nanoid();

/**
 * Reinterprets an existing string as a branded identifier.
 *
 * Needed at the boundaries where identifiers arrive as plain strings: import
 * files, URL parameters and database rows. Everywhere else the brand should
 * already be carried through.
 *
 * The type parameter appears once by design — this is a cast helper, and the
 * caller states which brand the string is known to carry.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function asId<T extends AnyId>(value: string): T {
  return value as T;
}
