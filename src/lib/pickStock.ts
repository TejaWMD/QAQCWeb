export interface PickableStock {
  id: string;
  carton: number;
  pcs_per_carton: number;
  loose_pcs: number;
  quantity: number;
}

export interface PickUpdateResult {
  carton: number;
  loose_pcs: number;
  quantity: number;
  picked_total_pcs: number;
  status: 'stored' | 'shipped';
  rack_cleared: boolean;
}

/**
 * Warehouse picking deduction with automatic carton-breaking when loose_pcs demand exceeds available loose_pcs.
 */
export function computePickUpdate(
  item: PickableStock,
  outCarton: number,
  outLoose: number
): PickUpdateResult {
  const ppc = Math.max(Number(item.pcs_per_carton) || 1, 1);
  let availCartons = Number(item.carton) || 0;
  let availLoose = Number(item.loose_pcs) || 0;

  const reqCartons = Math.max(0, Number(outCarton) || 0);
  const reqLoose = Math.max(0, Number(outLoose) || 0);
  const totalReqPcs = reqCartons * ppc + reqLoose;
  const totalAvailPcs = availCartons * ppc + availLoose;

  if (totalReqPcs > totalAvailPcs) {
    throw new Error(
      `Insufficient stock: requested ${totalReqPcs} pcs, available ${totalAvailPcs} pcs.`
    );
  }

  availCartons -= reqCartons;
  if (reqLoose > availLoose) {
    const deficit = reqLoose - availLoose;
    const cartonsToBreak = Math.ceil(deficit / ppc);
    availCartons -= cartonsToBreak;
    availLoose = availLoose + cartonsToBreak * ppc - reqLoose;
  } else {
    availLoose -= reqLoose;
  }

  const remainingQty = availCartons * ppc + availLoose;
  const depleted = remainingQty <= 0;

  return {
    carton: Math.max(0, availCartons),
    loose_pcs: Math.max(0, availLoose),
    quantity: Math.max(0, remainingQty),
    picked_total_pcs: totalReqPcs,
    status: depleted ? 'shipped' : 'stored',
    rack_cleared: depleted,
  };
}

export function formatQtyBreakdown(quantity: number, pcsPerCarton: number): string {
  const ppc = Math.max(Number(pcsPerCarton) || 0, 0);
  const qty = Math.max(Number(quantity) || 0, 0);
  if (ppc <= 0) return `${qty} PCS`;
  const cartons = Math.floor(qty / ppc);
  const loose = qty % ppc;
  return `${qty} PCS (${cartons} FULL CARTON${loose > 0 ? ` + LOOSE ${loose}` : ''})`;
}
