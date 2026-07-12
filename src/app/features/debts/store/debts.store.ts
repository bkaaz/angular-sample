import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  signalStore,
  withComputed,
  withFeature,
  withMethods,
  withProps,
} from '@ngrx/signals';
import { withClients } from '../../clients/feature/with-clients';
import { DebtsApi } from '../api/debts-api.service';
import { DebtDetail } from '../model/debt.model';

/** Provided on the `debts` route, so it dies when the user leaves the feature. */
export const DebtsStore = signalStore(
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
  // withFeature hands the store to the factory, so withClients needs no input constraint.
  withFeature((store) => withClients(() => store.ownerIds())),
  withMethods((store) => ({
    reload(): void {
      store._resource.reload();
    },
  }))
);
