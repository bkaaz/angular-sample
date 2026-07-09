import { Client } from '../../clients/model/client.model';
import { clientFullName } from '../../clients/util/client-name.util';
import { DebtDetail } from '../model/debt.model';

export interface DebtRow extends DebtDetail {
  ownerName: string;
}

export function toDebtRow(debt: DebtDetail, clientsById: Map<string, Client>): DebtRow {
  return { ...debt, ownerName: clientFullName(clientsById.get(debt.ownerId)) };
}
