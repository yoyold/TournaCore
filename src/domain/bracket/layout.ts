import type { GeneratedStructure, StructuralMatch } from '../formats/types';
import type { MatchId, MatchSlot } from '@models/index';

export interface BracketLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal gap between rounds. */
  columnGap: number;
  /** Vertical gap between adjacent matches of the first round. */
  rowGap: number;
  padding: number;
}

export const DEFAULT_LAYOUT_OPTIONS: BracketLayoutOptions = {
  nodeWidth: 232,
  nodeHeight: 60,
  columnGap: 64,
  rowGap: 20,
  padding: 24,
};

export interface BracketNode {
  matchId: MatchId;
  x: number;
  y: number;
  width: number;
  height: number;
  round: number;
  bracket: StructuralMatch['position']['bracket'];
}

export interface BracketConnector {
  id: string;
  from: MatchId;
  to: MatchId;
  /** Which side of the target match this feeds. */
  targetSlot: 'A' | 'B';
  /** Whether the winner or the loser travels along this edge. */
  kind: 'winner' | 'loser';
  /** SVG path, orthogonal with rounded corners. */
  path: string;
}

export interface BracketColumn {
  round: number;
  x: number;
  bracket: StructuralMatch['position']['bracket'];
  matchCount: number;
}

export interface BracketLayout {
  width: number;
  height: number;
  nodes: BracketNode[];
  nodeById: ReadonlyMap<MatchId, BracketNode>;
  connectors: BracketConnector[];
  columns: BracketColumn[];
}

/**
 * Computes bracket geometry as a pure function.
 *
 * Deliberately separate from rendering and free of DOM measurement. That makes
 * the layout testable without a browser, keeps it off the reflow path, and means
 * zoom and pan can be a CSS transform on the container rather than a
 * recalculation.
 *
 * The vertical rule is the one that makes a bracket read correctly: a match sits
 * centred between the two matches feeding it. Applied recursively from the first
 * round outwards, this produces the familiar shape where the final sits opposite
 * the middle of the field.
 */
export function computeBracketLayout(
  structure: GeneratedStructure,
  options: Partial<BracketLayoutOptions> = {},
): BracketLayout {
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const { nodeWidth, nodeHeight, columnGap, rowGap, padding } = opts;

  const pitch = nodeHeight + rowGap;
  const positions = new Map<MatchId, { x: number; y: number }>();
  const nodes: BracketNode[] = [];

  const mainMatches = structure.matches.filter((m) => m.position.bracket !== 'third_place');
  const extras = structure.matches.filter((m) => m.position.bracket === 'third_place');

  // Rounds are laid out left to right; matches inside a round keep their order.
  const rounds = [...new Set(mainMatches.map((m) => m.position.round))].sort((a, b) => a - b);

  let maxY = padding;

  for (const round of rounds) {
    const inRound = mainMatches
      .filter((m) => m.position.round === round)
      .sort((a, b) => a.position.indexInRound - b.position.indexInRound);

    const x = padding + round * (nodeWidth + columnGap);

    inRound.forEach((match, index) => {
      const y =
        round === 0
          ? padding + index * pitch
          : // Centre between the feeding matches. Falls back to even spacing
            // when a match has no resolvable predecessors.
            (centreBetweenFeeders(match, positions, nodeHeight) ?? padding + index * pitch);

      positions.set(match.id, { x, y });
      nodes.push({
        matchId: match.id,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        round,
        bracket: match.position.bracket,
      });
      maxY = Math.max(maxY, y + nodeHeight);
    });
  }

  /*
   * The third place match is placed below the whole bracket rather than centred
   * between the semifinals, where it would collide with the final.
   */
  for (const match of extras) {
    const x = padding + match.position.round * (nodeWidth + columnGap);
    const y = maxY + pitch;
    positions.set(match.id, { x, y });
    nodes.push({
      matchId: match.id,
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      round: match.position.round,
      bracket: 'third_place',
    });
    maxY = Math.max(maxY, y + nodeHeight);
  }

  const nodeById = new Map(nodes.map((node) => [node.matchId, node]));
  const connectors = buildConnectors(structure.matches, nodeById, opts);

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x + node.width), padding);

  const columns: BracketColumn[] = rounds.map((round) => ({
    round,
    x: padding + round * (nodeWidth + columnGap),
    bracket: 'winner',
    matchCount: mainMatches.filter((m) => m.position.round === round).length,
  }));

  return {
    width: maxX + padding,
    height: maxY + padding,
    nodes,
    nodeById,
    connectors,
    columns,
  };
}

function centreBetweenFeeders(
  match: StructuralMatch,
  positions: ReadonlyMap<MatchId, { x: number; y: number }>,
  nodeHeight: number,
): number | undefined {
  const feeders = [match.slotA, match.slotB]
    .map((slot) => feederId(slot))
    .filter((id): id is MatchId => id !== undefined)
    .map((id) => positions.get(id))
    .filter((position): position is { x: number; y: number } => position !== undefined);

  if (feeders.length === 0) return undefined;

  const centres = feeders.map((position) => position.y + nodeHeight / 2);
  const mid = centres.reduce((sum, value) => sum + value, 0) / centres.length;
  return mid - nodeHeight / 2;
}

function feederId(slot: MatchSlot): MatchId | undefined {
  return slot.kind === 'winner_of' || slot.kind === 'loser_of' ? slot.matchId : undefined;
}

function buildConnectors(
  matches: readonly StructuralMatch[],
  nodeById: ReadonlyMap<MatchId, BracketNode>,
  options: BracketLayoutOptions,
): BracketConnector[] {
  const connectors: BracketConnector[] = [];

  for (const match of matches) {
    const target = nodeById.get(match.id);
    if (!target) continue;

    for (const [side, slot] of [
      ['A', match.slotA],
      ['B', match.slotB],
    ] as const) {
      const sourceId = feederId(slot);
      if (sourceId === undefined) continue;

      const source = nodeById.get(sourceId);
      if (!source) continue;

      // Rows are the two team lines inside a node; a connector should meet the
      // one it actually fills rather than the node's centre.
      const targetY = target.y + (side === 'A' ? target.height * 0.3 : target.height * 0.7);
      const sourceY = source.y + source.height / 2;

      connectors.push({
        id: `${sourceId}->${match.id}:${side}`,
        from: sourceId,
        to: match.id,
        targetSlot: side,
        kind: slot.kind === 'winner_of' ? 'winner' : 'loser',
        path: orthogonalPath(
          source.x + source.width,
          sourceY,
          target.x,
          targetY,
          options.columnGap,
        ),
      });
    }
  }

  return connectors;
}

/**
 * Right-angled path with rounded corners, in the style tournament brackets use.
 *
 * Runs horizontally out of the source, turns once at the midpoint of the gap,
 * then runs horizontally into the target. A straight diagonal would be shorter
 * but makes dense brackets hard to follow.
 */
function orthogonalPath(x1: number, y1: number, x2: number, y2: number, gap: number): string {
  const midX = x1 + gap / 2;

  if (Math.abs(y1 - y2) < 0.5) return `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;

  const radius = Math.min(8, Math.abs(y2 - y1) / 2, gap / 4);
  const down = y2 > y1;
  const sweepIn = down ? 1 : 0;
  const sweepOut = down ? 0 : 1;
  const dir = down ? 1 : -1;

  return [
    `M ${f(x1)} ${f(y1)}`,
    `L ${f(midX - radius)} ${f(y1)}`,
    `A ${f(radius)} ${f(radius)} 0 0 ${String(sweepIn)} ${f(midX)} ${f(y1 + dir * radius)}`,
    `L ${f(midX)} ${f(y2 - dir * radius)}`,
    `A ${f(radius)} ${f(radius)} 0 0 ${String(sweepOut)} ${f(midX + radius)} ${f(y2)}`,
    `L ${f(x2)} ${f(y2)}`,
  ].join(' ');
}

/** Rounds to two decimals so paths stay compact and snapshot-stable. */
function f(value: number): string {
  return String(Math.round(value * 100) / 100);
}
