import { Client } from '../model/client.model';

export function clientFullName(client: Client | undefined): string {
  return client ? `${client.firstName} ${client.lastName}` : '—';
}
