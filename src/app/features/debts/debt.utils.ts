import { Client, DebtDetail, DebtWithOwner } from './debt.model';

export function toDebtWithOwner(detail: DebtDetail, clientsMap: Map<string, Client>): DebtWithOwner {
  const client = clientsMap.get(detail.ownerId);
  return {
    ...detail,
    ownerName: client ? `${client.firstName} ${client.lastName}` : '—',
  };
}
