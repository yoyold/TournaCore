import type { GeneratedStructure, StructuralMatch } from '../formats/types';
import type { MatchId, MatchSlot } from '@models/index';

export interface BracketLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal gap between rounds. */
  columnGap: number;
  /** Vertical gap between adjacent matches of the first round. */
  rowGap: number;
  /** Vertical gap between the winner and loser bracket bands. */
  bandGap: number;
  /** Vertical space reserved above each band for its caption. */
  bandLabelHeight: number;
  padding: number;
}

export const DEFAULT_LAYOUT_OPTIONS: BracketLayoutOptions = {
  nodeWidth: 232,
  nodeHeight: 60,
  columnGap: 64,
  rowGap: 20,
  bandGap: 56,
  bandLabelHeight: 26,
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

/**
 * Caption marking where a bracket begins.
 *
 * Two stacked bands are unreadable without one: the drawing alone does not say
 * which half is the loser bracket, and the difference decides what a match
 * means.
 */
export interface BracketBand {
  bracket: 'winner' | 'loser';
  x: number;
  y: number;
}

export interface BracketLayout {
  width: number;
  height: number;
  nodes: BracketNode[];
  nodeById: ReadonlyMap<MatchId, BracketNode>;
  connectors: BracketConnector[];
  columns: BracketColumn[];
  /** Empty for a single bracket, which needs no caption to be understood. */
  bands: BracketBand[];
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
  const { nodeWidth, nodeHeight, columnGap, rowGap, bandGap, padding } = opts;

  const pitch = nodeHeight + rowGap;
  const positions = new Map<MatchId, { x: number; y: number }>();
  const nodes: BracketNode[] = [];

  const winnerMatches = structure.matches.filter(
    (m) =>
      m.position.bracket !== 'third_place' &&
      m.position.bracket !== 'loser' &&
      m.position.bracket !== 'grand_final',
  );
  const loserMatches = structure.matches.filter((m) => m.position.bracket === 'loser');
  const finalMatches = structure.matches.filter((m) => m.position.bracket === 'grand_final');
  const extras = structure.matches.filter((m) => m.position.bracket === 'third_place');

  const band = (matches: readonly StructuralMatch[], top: number): number =>
    layoutBand({ matches, top, opts, positions, nodes });

  // A single bracket is self-explanatory and gets no caption, which also keeps
  // its geometry byte-for-byte what it was before double elimination existed.
  const banded = loserMatches.length > 0;
  const labelSpace = banded ? opts.bandLabelHeight : 0;
  const bands: BracketBand[] = [];

  if (banded) bands.push({ bracket: 'winner', x: padding, y: padding });

  let maxY = band(winnerMatches, padding + labelSpace);

  /*
   * The loser bracket is laid out as a second band underneath rather than woven
   * into the same columns. Its rounds progress at half the winner bracket's
   * pace and there are nearly twice as many of them, so interleaving would put
   * unrelated matches in the same column and leave the reader guessing which
   * bracket a node belongs to.
   *
   * Vertical centring inside a band deliberately ignores feeders from the other
   * one: a loser match fed by a winner bracket casualty would otherwise be
   * dragged up into the band above it.
   */
  if (loserMatches.length > 0) {
    bands.push({ bracket: 'loser', x: padding, y: maxY + bandGap });
    maxY = Math.max(maxY, band(loserMatches, maxY + bandGap + labelSpace));
  }

  /*
   * The grand final belongs to neither band, so it goes in its own column to the
   * right of both, level with the gap between them — which is also where the two
   * paths into it converge.
   */
  if (finalMatches.length > 0) {
    const lastColumn = [...winnerMatches, ...loserMatches].reduce(
      (max, match) => Math.max(max, match.position.round),
      0,
    );

    const sorted = [...finalMatches].sort((a, b) => a.position.round - b.position.round);
    const first = sorted[0];
    const finalY =
      (first ? centreBetweenFeeders(first, positions, nodeHeight, () => true) : undefined) ??
      padding;

    for (const match of sorted) {
      const x = padding + (lastColumn + 1 + match.position.round) * (nodeWidth + columnGap);
      /*
       * The bracket reset takes the next column at the same height. Centring it
       * would put it exactly on top of the grand final, which feeds it, and both
       * finalists carry over — so a plain step to the right reads as the
       * continuation it is.
       */
      const y = finalY;

      positions.set(match.id, { x, y });
      nodes.push({
        matchId: match.id,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        round: match.position.round,
        bracket: 'grand_final',
      });
      maxY = Math.max(maxY, y + nodeHeight);
    }
  }

  /*
   * The third place match sits directly below the final, in the same column.
   *
   * Centring it between the semifinals — where its two feeders are — would put
   * it on top of the final. Pushing it below the entire bracket avoids that but
   * leaves a large void between the two, which reads as a rendering fault. The
   * final's column holds nothing else, so placing it just underneath is both
   * safe and where readers expect it.
   */
  for (const match of extras) {
    const x = padding + match.position.round * (nodeWidth + columnGap);
    const sameColumn = nodes.filter((node) => node.x === x);
    const below = sameColumn.reduce(
      (lowest, node) => Math.max(lowest, node.y + node.height),
      padding,
    );
    const y = below + pitch;
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

  const columns: BracketColumn[] = nodes
    .filter((node) => node.bracket !== 'third_place')
    .reduce<BracketColumn[]>((acc, node) => {
      const existing = acc.find(
        (column) => column.round === node.round && column.bracket === node.bracket,
      );
      if (existing) {
        existing.matchCount += 1;
        return acc;
      }
      acc.push({ round: node.round, x: node.x, bracket: node.bracket, matchCount: 1 });
      return acc;
    }, []);

  return {
    width: maxX + padding,
    height: maxY + padding,
    nodes,
    nodeById,
    connectors,
    columns,
    bands,
  };
}

/**
 * Places one horizontal band of a bracket: rounds left to right, each match
 * centred between the two feeding it.
 *
 * `top` is where the band begins vertically, which is what allows a second one
 * to be stacked below the first without either knowing about the other.
 */
function layoutBand(input: {
  matches: readonly StructuralMatch[];
  top: number;
  opts: BracketLayoutOptions;
  positions: Map<MatchId, { x: number; y: number }>;
  nodes: BracketNode[];
}): number {
  const { matches, top, opts, positions, nodes } = input;
  const { nodeWidth, nodeHeight, columnGap, rowGap, padding } = opts;

  const pitch = nodeHeight + rowGap;
  const inBand = new Set(matches.map((match) => match.id));
  const rounds = [...new Set(matches.map((m) => m.position.round))].sort((a, b) => a - b);

  let maxY = top;

  for (const round of rounds) {
    const inRound = matches
      .filter((m) => m.position.round === round)
      .sort((a, b) => a.position.indexInRound - b.position.indexInRound);

    const x = padding + round * (nodeWidth + columnGap);

    inRound.forEach((match, index) => {
      const centred = centreBetweenFeeders(match, positions, nodeHeight, (id) => inBand.has(id));
      // Falls back to even spacing when a match has no predecessors inside this
      // band — the first round of either bracket, and every drop-in round whose
      // only feeder sits in the band above.
      const y = round === 0 ? top + index * pitch : (centred ?? top + index * pitch);

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

  return maxY;
}

function centreBetweenFeeders(
  match: StructuralMatch,
  positions: ReadonlyMap<MatchId, { x: number; y: number }>,
  nodeHeight: number,
  accept: (matchId: MatchId) => boolean,
): number | undefined {
  const feeders = [match.slotA, match.slotB]
    .map((slot) => feederId(slot))
    .filter((id): id is MatchId => id !== undefined && accept(id))
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
