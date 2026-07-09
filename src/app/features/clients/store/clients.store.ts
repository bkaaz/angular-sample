import { computed, DestroyRef, inject, Signal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { ClientsApi } from '../api/clients-api.service';
import { Client } from '../model/client.model';

export const ClientsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    const api = inject(ClientsApi);

    const demands = signal<readonly Signal<readonly string[]>[]>([]);

    // Must be a primitive: rxResource compares params with Object.is, so a fresh array
    // would refetch forever.
    const requiredIdsKey = computed(() => {
      const ids = new Set(demands().flatMap((demand) => demand()));
      return ids.size ? [...ids].sort().join(',') : undefined;
    });

    return {
      _demands: demands,
      _resource: rxResource<Client[], string | undefined>({
        params: () => requiredIdsKey(), // undefined => idle, no request
        stream: ({ params: key }) => api.getByIds(key.split(',')),
      }),
    };
  }),
  withComputed((store) => ({
    clientsById: computed(
      () => new Map((store._resource.value() ?? []).map((c) => [c.id, c]))
    ),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withMethods((store) => ({
    /** Prefer `injectClientsDemand()`, which wires up the withdrawal for you. */
    registerDemand(ids: Signal<readonly string[]>, destroyRef: DestroyRef): void {
      store._demands.update((demands) => [...demands, ids]);
      destroyRef.onDestroy(() =>
        store._demands.update((demands) => demands.filter((d) => d !== ids))
      );
    },
  }))
);

/**
 * Declares which clients a view needs. Must be called in an injection context.
 * The demand is withdrawn when the component is destroyed, so nothing is cached.
 */
export function injectClientsDemand(ids: () => readonly string[]): void {
  inject(ClientsStore).registerDemand(computed(ids), inject(DestroyRef));
}
