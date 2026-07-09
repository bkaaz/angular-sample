export interface Debt {
  id: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  description: string;
}

export interface DebtDetail extends Debt {
  ownerId: string;
}
