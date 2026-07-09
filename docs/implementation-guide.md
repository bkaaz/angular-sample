# Implementation guide

Read [architecture.md](./architecture.md) first — it explains *why*. This document is *how*.

The skeletons below are minimal on purpose. Adapt names and paths to the target repo. Do not
copy the reference files verbatim; copy the shape.

---

## Order of work

Build in this order. Each step compiles and is reviewable on its own.

1. **Models** — one file per resource, transport types only.
2. **API services** — one per resource, one method per endpoint, no joins.
3. **Stores** — one per resource. Start with the simple parameterless one.
4. **Projection** — the pure function that combines two resources.
5. **Views** — inject stores, compose with `computed`.
6. **Wiring** — register interceptors and `withComponentInputBinding()`.

---

## Hard rules

Violating any of these produces bugs that are silent, not loud. That is why they are listed
before the code.

### `rxResource`

- The option is **`stream:`**, not `loader:`. `loader:` was removed in Angular 19.
- **NEVER call `inject()` inside `stream`.** `stream` runs outside the injection context.
  Angular's `rxResource` **silently swallows** the resulting error: no console output, the
  resource just sits in `status: 'error'`. Capture injected values in the `withProps` factory
  and close over them.
- Because of the above, always use the **explicit factory form** when `withProps` holds an
  `rxResource`:

  ```typescript
  // WRONG — inject() is deferred into stream, fails silently
  withProps(() => ({
    _resource: rxResource({ stream: () => inject(SomeService).get() }),
  }))

  // CORRECT — explicit return, inject() runs in the factory
  withProps(() => {
    const svc = inject(SomeService);
    return { _resource: rxResource({ stream: () => svc.get() }) };
  })
  ```

  The compact `() => ({...})` form makes the `inject()` *look* like it is in the factory when
  it is actually inside the `stream` arrow.

- **`params` must return a primitive.** `rxResource` compares params with `Object.is`. A fresh
  array or object on every recomputation is never equal to the previous one, so the resource
  refetches forever. Use a sorted, joined string — it is also literally what goes into the query
  string.

  ```typescript
  // WRONG — new array identity each time => infinite refetch loop
  params: () => [...ids()]

  // CORRECT — primitive, stable under Object.is
  params: () => (ids().length ? [...ids()].sort().join(',') : undefined)
  ```

- **`params` returning `undefined` puts the resource in `idle`** — no request is issued. Declare
  the type as `rxResource<T, P | undefined>` and `stream` will receive `P` narrowed. Use this
  for "nothing to fetch yet".

### Store hygiene

- Prefix private members with `_`. `OmitPrivate<T>` strips them from the public store type.
- State changes only via `patchState(store, { ... })`, only inside `withMethods`.
- Stores expose **signals**, never observables.

### Never

- **Never join in an API service.** One method, one endpoint.
- **Never create a facade / view store** that injects two resource stores. Use a pure function.
- **Never let a resource store import another resource store.**
- **Never put a view model in the `model` layer.** It belongs with the projection that builds it.
- **Never add an accumulating client cache** (`requestedIds` that only grows).

---

## Skeleton: a plain resource store

Use this for any resource fetched without parameters. `DebtsStore` is this shape.

```typescript
export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    const api = inject(DebtsApi);              // inject() ONLY here
    return {
      _resource: rxResource<DebtDetail[], void>({
        stream: () => api.getDebts(),          // closure, no inject()
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
    reload: () => store._resource.reload(),
  })),
);
```

`providedIn: 'root'` + parameterless `rxResource` is the whole caching mechanism: the store is
created lazily on first `inject()` and fetches once. **Do not add an `ensureLoaded` for this
shape** — the store existing already means the request went out. Deep-link and in-app navigation
follow the same path.

Note the two `withComputed` blocks: the second reads `store.debts()` from the first. Derived
signals that build on other derived signals need a separate block.

---

## Skeleton: a demand-scoped store

Use this when a resource is fetched **by id** and must not be cached. `ClientsStore` is this
shape. It holds exactly what the currently-living views ask for, and nothing else.

```typescript
export const ClientsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    const api = inject(ClientsApi);
    const demands = signal<readonly Signal<readonly string[]>[]>([]);

    // Primitive key — see the params rule above.
    const requiredIdsKey = computed(() => {
      const ids = new Set(demands().flatMap((demand) => demand()));
      return ids.size ? [...ids].sort().join(',') : undefined;
    });

    return {
      _demands: demands,
      _resource: rxResource<Client[], string | undefined>({
        params: () => requiredIdsKey(),        // undefined => idle, no request
        stream: ({ params: key }) => api.getByIds(key.split(',')),
      }),
    };
  }),
  withComputed((store) => ({
    clientsById: computed(
      () => new Map((store._resource.value() ?? []).map((c) => [c.id, c])),
    ),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withMethods((store) => ({
    registerDemand(ids: Signal<readonly string[]>, destroyRef: DestroyRef): void {
      store._demands.update((demands) => [...demands, ids]);
      destroyRef.onDestroy(() =>
        store._demands.update((demands) => demands.filter((d) => d !== ids)),
      );
    },
  })),
);

/** The only supported way for a view to declare what it needs. Call in an injection context. */
export function injectClientsDemand(ids: () => readonly string[]): void {
  inject(ClientsStore).registerDemand(computed(ids), inject(DestroyRef));
}
```

Why a **union of live demands** rather than a single `setRequired(ids)` that overwrites? With
overwrite semantics, two views alive at once fight: the last caller wipes the first one's
request and that view silently renders `—` instead of names. A router shows one view at a time
today, but headers, sidebars and widgets will not.

Consumers write one line, and cleanup is automatic:

```typescript
constructor() {
  injectClientsDemand(() => this.debtsStore.ownerIds());
}
```

The dependency direction is what matters: **the view** knows it needs both resources. If
`ClientsStore` reached for `ownerIds` itself, the two resources would be coupled permanently.

---

## Skeleton: the view

```typescript
export class DebtsListComponent {
  private readonly debtsStore = inject(DebtsStore);
  private readonly clientsStore = inject(ClientsStore);

  protected readonly rows = computed(() => {
    const clientsById = this.clientsStore.clientsById();
    return this.debtsStore.debts().map((debt) => toDebtRow(debt, clientsById));
  });

  protected readonly isLoading = computed(
    () => this.debtsStore.isLoading() || this.clientsStore.isLoading(),
  );
  protected readonly hasError = computed(
    () => this.debtsStore.hasError() || this.clientsStore.hasError(),
  );

  constructor() {
    injectClientsDemand(() => this.debtsStore.ownerIds());
  }
}
```

### Loading and error state

Independent fetching costs you the atomic emission that a single RxJS pipeline gives for free.
Two consequences you **must** handle:

1. **Combine the loading flags.** Without `isLoading = a.isLoading() || b.isLoading()`, the table
   flashes rows whose `ownerName` is still the `—` placeholder.
2. **Order the template branches: loading → error → data → not-found.** A lookup like
   `debtsById().get(id)` returns `undefined` while loading *and* when the id does not exist.
   Without the loading gate first, a deep-link briefly renders "not found".

```
@if (isLoading())      { …spinner… }
@else if (hasError())  { …error… }
@else if (debt(); as d){ …data… }
@else                  { …not found… }
```

---

## Verification checklist

Build passing proves nothing here — `rxResource` swallows errors from `stream`. Exercise the app
and check each item.

- [ ] No `inject()` appears inside any `stream` function.
- [ ] Every `withProps` holding an `rxResource` uses the explicit `() => { … return {…} }` form.
- [ ] Every `params` returns a primitive or `undefined`, never a fresh array/object.
- [ ] No resource store imports another resource store.
- [ ] No API service calls more than one endpoint.
- [ ] The API service of each resource is **not** in the library's public API.
- [ ] View models are not in the `model` layer.
- [ ] Rendering the list issues **exactly one** `/api/clients` request, with sorted ids.
      More than one means the params key is unstable — a refetch loop.
- [ ] Navigating list → detail issues **zero** `/api/debts` requests and one narrowed
      `/api/clients?ids=<single owner>`.
- [ ] Deep-link to a detail page renders it correctly from a cold start.
- [ ] Deep-link to a non-existent id shows "not found", never a stuck spinner, and issues **no**
      `/api/clients` request (the store stays idle).
- [ ] Browser console is free of errors and warnings.
- [ ] Every API workaround carries a `TODO(api):` comment saying what to delete when the backend
      changes.

To count requests when a mock interceptor short-circuits them (`of(new HttpResponse(...))`
never reaches the network), temporarily `console.log` inside the interceptor. Remove it after.
