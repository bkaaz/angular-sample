import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { DebtWithOwner } from './debt.model';
import { DebtsApi } from './debts-api.service';

export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withState({ selectedDebtId: null as string | null }),
  withProps(() => {
    const api = inject(DebtsApi);
    return {
      _resource: rxResource<DebtWithOwner[], void>({
        stream: () => api.getDebtsWithOwners(),
      }),
    };
  }),
  withComputed((store) => ({
    debts: computed(() => store._resource.value() ?? []),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withMethods((store) => ({
    reload(): void {
      store._resource.reload();
    },
    selectDebt(id: string | null): void {
      patchState(store, { selectedDebtId: id });
    },
  }))
);
