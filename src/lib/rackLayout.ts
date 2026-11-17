export interface RackLineConfig {
  id: string;
  name: string;
  rack_count: number;
  sort_order: number;
}

export interface RackSlot {
  code: string;
  lineName: string;
  rackNumber: number;
  layer: 'G' | 'M' | 'T';
  slot: 'A' | 'B';
}

export const RACK_LAYERS: Array<'T' | 'M' | 'G'> = ['T', 'M', 'G'];
export const RACK_SIDES: Array<'A' | 'B'> = ['A', 'B'];
export const DEFAULT_STAGING_AREA = 'Waiting Area';

export function buildRackLayout(lines: RackLineConfig[]) {
  const sorted = [...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  let counter = 1;

  return sorted.map((line) => {
    const count = Math.max(1, Number(line.rack_count) || 1);
    const racks = [];
    for (let i = 0; i < count; i++) {
      const rackNumber = counter++;
      const slots: RackSlot[] = [];
      for (const layer of RACK_LAYERS) {
        for (const side of RACK_SIDES) {
          slots.push({
            code: `${layer}${rackNumber}${side}`,
            lineName: line.name,
            rackNumber,
            layer,
            slot: side,
          });
        }
      }
      racks.push({ rackNumber, slots });
    }
    return { ...line, racks };
  });
}
