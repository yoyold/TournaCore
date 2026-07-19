import { describe, expect, it } from 'vitest';

import { generateSingleElimination } from '@domain/formats/singleElimination';
import { asId, type SingleEliminationConfig, type StageId } from '@models/index';

import { DEFAULT_LAYOUT_OPTIONS, computeBracketLayout } from './layout';

const STAGE = asId<StageId>('stage-1');

const config = (thirdPlaceMatch = false): SingleEliminationConfig => ({
  kind: 'single_elimination',
  thirdPlaceMatch,
  byePlacement: 'seeded',
  matchFormats: { default: { kind: 'bo', games: 3 } },
});

function layoutFor(participants: number, thirdPlaceMatch = false) {
  const structure = generateSingleElimination({
    stageId: STAGE,
    config: config(thirdPlaceMatch),
    slotCount: participants,
  });
  return computeBracketLayout(structure);
}

describe('computeBracketLayout', () => {
  it('places one node per match', () => {
    const structure = generateSingleElimination({
      stageId: STAGE,
      config: config(),
      slotCount: 8,
    });
    const layout = computeBracketLayout(structure);

    expect(layout.nodes).toHaveLength(structure.matches.length);
    expect(layout.nodeById.size).toBe(structure.matches.length);
  });

  it('lays rounds out left to right with a constant column pitch', () => {
    const layout = layoutFor(8);
    const { nodeWidth, columnGap } = DEFAULT_LAYOUT_OPTIONS;

    const xByRound = new Map<number, number>();
    for (const node of layout.nodes) xByRound.set(node.round, node.x);

    expect(xByRound.get(1)! - xByRound.get(0)!).toBe(nodeWidth + columnGap);
    expect(xByRound.get(2)! - xByRound.get(1)!).toBe(nodeWidth + columnGap);
  });

  it('spaces the first round evenly without overlap', () => {
    const layout = layoutFor(8);
    const first = layout.nodes.filter((n) => n.round === 0).sort((a, b) => a.y - b.y);

    for (let i = 1; i < first.length; i += 1) {
      const gap = first[i]!.y - (first[i - 1]!.y + first[i - 1]!.height);
      expect(gap).toBe(DEFAULT_LAYOUT_OPTIONS.rowGap);
    }
  });

  it('centres a match between the two feeding it', () => {
    const layout = layoutFor(8);

    const first = layout.nodes.filter((n) => n.round === 0).sort((a, b) => a.y - b.y);
    const semifinal = layout.nodes.filter((n) => n.round === 1).sort((a, b) => a.y - b.y)[0]!;

    const expected = (centre(first[0]!) + centre(first[1]!)) / 2 - semifinal.height / 2;
    expect(semifinal.y).toBeCloseTo(expected, 5);
  });

  it('centres the final opposite the middle of the field', () => {
    const layout = layoutFor(8);
    const final = layout.nodes.find((n) => n.round === 2)!;
    const firstRound = layout.nodes.filter((n) => n.round === 0);

    const top = Math.min(...firstRound.map((n) => n.y));
    const bottom = Math.max(...firstRound.map((n) => n.y + n.height));

    expect(centre(final)).toBeCloseTo((top + bottom) / 2, 5);
  });

  it('never overlaps two nodes', () => {
    for (const n of [2, 4, 8, 13, 16, 32]) {
      const layout = layoutFor(n, true);
      for (let i = 0; i < layout.nodes.length; i += 1) {
        for (let j = i + 1; j < layout.nodes.length; j += 1) {
          expect(overlaps(layout.nodes[i]!, layout.nodes[j]!), `count ${String(n)}`).toBe(false);
        }
      }
    }
  });

  it('places the third place match directly below the final, in the same column', () => {
    const layout = layoutFor(8, true);
    const third = layout.nodes.find((n) => n.bracket === 'third_place')!;
    const final = layout.nodes.find((n) => n.round === 2 && n.bracket === 'winner')!;

    // Same column, immediately underneath: centring it between the semifinals
    // would land it on top of the final, and pushing it below the whole bracket
    // leaves a void that reads as a rendering fault.
    expect(third.x).toBe(final.x);
    expect(third.y).toBeGreaterThan(final.y);
    // At most one row pitch of separation, so the two read as adjacent.
    expect(third.y - (final.y + final.height)).toBeLessThanOrEqual(
      DEFAULT_LAYOUT_OPTIONS.nodeHeight + DEFAULT_LAYOUT_OPTIONS.rowGap,
    );
  });

  it('reports a canvas that contains every node', () => {
    const layout = layoutFor(13);

    for (const node of layout.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(layoutFor(13))).toBe(JSON.stringify(layoutFor(13)));
  });

  it('honours overridden dimensions', () => {
    const structure = generateSingleElimination({
      stageId: STAGE,
      config: config(),
      slotCount: 4,
    });
    const layout = computeBracketLayout(structure, { nodeWidth: 100, columnGap: 20 });

    const round1 = layout.nodes.find((n) => n.round === 1)!;
    const round0 = layout.nodes.find((n) => n.round === 0)!;
    expect(round1.x - round0.x).toBe(120);
  });

  it('handles an empty structure', () => {
    const structure = generateSingleElimination({
      stageId: STAGE,
      config: config(),
      slotCount: 1,
    });
    const layout = computeBracketLayout(structure);

    expect(layout.nodes).toHaveLength(0);
    expect(layout.connectors).toHaveLength(0);
  });
});

describe('connectors', () => {
  it('draws one edge per structural reference', () => {
    const layout = layoutFor(8);
    // Seven matches: four in round one have no predecessors, the remaining
    // three consume two each.
    expect(layout.connectors).toHaveLength(6);
  });

  it('links a source to a target that exists', () => {
    const layout = layoutFor(8);

    for (const connector of layout.connectors) {
      expect(layout.nodeById.has(connector.from)).toBe(true);
      expect(layout.nodeById.has(connector.to)).toBe(true);
    }
  });

  it('starts at the source edge and ends at the target edge', () => {
    const layout = layoutFor(4);
    const connector = layout.connectors[0]!;
    const from = layout.nodeById.get(connector.from)!;
    const to = layout.nodeById.get(connector.to)!;

    expect(connector.path.startsWith(`M ${String(from.x + from.width)}`)).toBe(true);
    expect(connector.path.endsWith(String(to.x))).toBe(false);
    expect(connector.path).toContain(`L ${String(to.x)}`);
  });

  it('marks loser edges distinctly from winner edges', () => {
    const layout = layoutFor(8, true);
    const kinds = new Set(layout.connectors.map((c) => c.kind));

    expect(kinds).toContain('winner');
    expect(kinds).toContain('loser');
  });

  it('feeds the upper slot above the lower one', () => {
    const layout = layoutFor(4);
    const a = layout.connectors.find((c) => c.targetSlot === 'A')!;
    const b = layout.connectors.find((c) => c.targetSlot === 'B')!;

    expect(endY(a.path)).toBeLessThan(endY(b.path));
  });

  it('emits a straight line when source and target are level', () => {
    const layout = layoutFor(2);
    // A two-participant bracket has a single match and therefore no edges.
    expect(layout.connectors).toHaveLength(0);
  });
});

// --- helpers ----------------------------------------------------------------

const centre = (node: { y: number; height: number }): number => node.y + node.height / 2;

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Final y coordinate of a path, i.e. where it meets the target node. */
function endY(path: string): number {
  const parts = path.trim().split(/\s+/);
  return Number(parts[parts.length - 1]);
}
