export type EscrowState =
  | "CREATED"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

const validTransitions: Record<EscrowState, EscrowState[]> = {
  CREATED: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "DISPUTED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  DISPUTED: ["COMPLETED", "CANCELLED"],
  CANCELLED: [],
};

export function assertTransition(from: EscrowState, to: EscrowState) {
  if (!validTransitions[from].includes(to)) {
    throw new Error(`Invalid state transition from ${from} to ${to}`);
  }
}
