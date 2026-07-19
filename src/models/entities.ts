import type { IsoDate, IsoDateTime, Region, SocialLink, Timestamps } from './common';
import type {
  AssetId,
  GameId,
  MapId,
  ParticipantId,
  PlayerId,
  RosterEntryId,
  StageId,
  TeamId,
  TournamentId,
} from './ids';
import type { MatchFormat } from './match';

/**
 * A game title.
 *
 * Owns the map pool, because maps belong to the game rather than to a single
 * tournament. Without this entity there is no sensible source for map picks and
 * no way to aggregate statistics per map across tournaments.
 */
export interface Game extends Timestamps {
  id: GameId;
  name: string;
  /** Abbreviation used in dense views, e.g. "CS2". */
  shortName: string;
  iconAssetId?: AssetId;
  maps: MapDefinition[];
  defaultMatchFormat: MatchFormat;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  imageAssetId?: AssetId;
  /**
   * Whether the map is in the current rotation. Retired maps stay in the list so
   * historical match results keep resolving to a name.
   */
  active: boolean;
}

/**
 * Persistent team identity, reusable across any number of tournaments.
 *
 * Holds no tournament-specific data — a seed or a placement belongs to the
 * participant record inside one tournament, not to the team itself.
 */
export interface Team extends Timestamps {
  id: TeamId;
  name: string;
  /** Short tag shown in brackets, e.g. "G2". */
  tag: string;
  logoAssetId?: AssetId;
  bannerAssetId?: AssetId;
  region?: Region;
  /** ISO 3166-1 alpha-2. */
  countryCode?: string;
  description?: string;
  foundedAt?: IsoDate;
  socials: SocialLink[];
  /**
   * Archived teams are hidden from pickers but never deleted.
   *
   * Deleting a team that appears in past matches would leave dangling
   * references and silently rewrite tournament history.
   */
  archived: boolean;
}

/**
 * An individual player.
 *
 * `realName` is personal data. The UI should encourage nicknames, because a user
 * who records real names becomes a data controller for third-party information.
 */
export interface Player extends Timestamps {
  id: PlayerId;
  nickname: string;
  realName?: string;
  countryCode?: string;
  avatarAssetId?: AssetId;
  socials: SocialLink[];
  archived: boolean;
}

/**
 * Time-bounded membership of a player in a team.
 *
 * Modelled as its own entity because players change teams. A direct
 * `Team.players[]` relation makes historical questions ("who played in last
 * year's final?") unanswerable, and retrofitting it later means migrating every
 * existing record.
 */
export interface RosterEntry {
  id: RosterEntryId;
  teamId: TeamId;
  playerId: PlayerId;
  role?: string;
  joinedAt: IsoDate;
  /** Undefined means the player is still on the roster. */
  leftAt?: IsoDate;
  isSubstitute: boolean;
}

/**
 * Binary data, stored separately from the metadata that references it.
 *
 * Keeping blobs in their own table lets tournament and team lists load without
 * dragging image data along, which is the difference between an instant list and
 * a visibly slow one once a few dozen logos exist.
 */
export interface Asset {
  id: AssetId;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  originalFileName: string;
  createdAt: IsoDateTime;
}

export type TournamentStatus = 'draft' | 'registration' | 'live' | 'completed' | 'cancelled';

export type ParticipantStatus = 'active' | 'withdrawn' | 'disqualified';

/**
 * A team in the context of ONE tournament.
 *
 * Carries the seed and participation status, which are tournament-specific and
 * therefore do not belong on the team.
 */
export interface Participant {
  id: ParticipantId;
  teamId: TeamId;
  /** 1 is the strongest seed. */
  seed: number;
  status: ParticipantStatus;
  note?: string;
}

export interface Tournament extends Timestamps {
  id: TournamentId;
  name: string;
  /** URL-safe identifier, unique across tournaments. */
  slug: string;
  description?: string;
  gameId: GameId;
  organizer?: string;
  logoAssetId?: AssetId;
  bannerAssetId?: AssetId;
  startsAt?: IsoDateTime;
  endsAt?: IsoDateTime;
  status: TournamentStatus;
  participants: Participant[];
  /** Ordered. This list defines how the tournament progresses. */
  stageIds: StageId[];
}
