import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { DebtsApi } from '../api/debts-api.service';
import { DebtDetail } from '../model/debt.model';

export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    const api = inject(DebtsApi);
    return {
      _resource: rxResource<DebtDetail[], void>({
        stream: () => api.getDebts(),
      }),
    };
  }),
  withComputed((store) => ({
    debts: computed(() => store._resource.value() ?? []),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withComputed((store) => ({
    debtsById: computed(() => new Map(store.debts().map((d) => [d.id, d]))),
    ownerIds: computed(() => [...new Set(store.debts().map((d) => d.ownerId))]),
  })),
  withMethods((store) => ({
    reload(): void {
      store._resource.reload();
    },
  }))
);
