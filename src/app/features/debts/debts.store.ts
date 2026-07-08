import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { Client, Debt, DebtDetail, DebtWithOwner } from './debt.model';

export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withState({ selectedDebtId: null as string | null }),
  withProps(() => {
    const http = inject(HttpClient);

    const _debtsResource = rxResource<Debt[], void>({
      stream: () => http.get<Debt[]>('/api/debts'),
    });

    // Fires automatically when _debtsResource.value() becomes available (undefined → idle)
    const _debtDetailsResource = rxResource<DebtDetail[], Debt[] | undefined>({
      params: () => _debtsResource.value(),
      stream: ({ params: debts }) => {
        if (!debts.length) return of([]);
        return forkJoin(debts.map((d) => http.get<DebtDetail>(`/api/debts/${d.id}`)));
      },
    });

    const _clientsResource = rxResource<Client[], void>({
      stream: () => http.get<Client[]>('/api/clients'),
    });

    return { _debtsResource, _debtDetailsResource, _clientsResource };
  }),
  withComputed((store) => ({
    debtsWithOwners: computed<DebtWithOwner[]>(() => {
      const debts = store._debtsResource.value() ?? [];
      const details = store._debtDetailsResource.value() ?? [];
      const clients = store._clientsResource.value() ?? [];

      return debts.map((debt) => {
        const detail = details.find((d) => d.id === debt.id);
        const client = detail ? clients.find((c) => c.id === detail.ownerId) : undefined;
        return {
          ...debt,
          ownerName: client ? `${client.firstName} ${client.lastName}` : '—',
        };
      });
    }),
    isLoading: computed(
      () =>
        store._debtsResource.isLoading() ||
        store._debtDetailsResource.isLoading() ||
        store._clientsResource.isLoading()
    ),
    hasError: computed(
      () =>
        store._debtsResource.status() === 'error' ||
        store._debtDetailsResource.status() === 'error' ||
        store._clientsResource.status() === 'error'
    ),
  })),
  withMethods((store) => ({
    reload(): void {
      store._debtsResource.reload();
      store._clientsResource.reload();
      // _debtDetailsResource reloads automatically via params: () => _debtsResource.value()
    },
    selectDebt(id: string | null): void {
      patchState(store, { selectedDebtId: id });
    },
  }))
);
