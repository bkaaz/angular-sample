# Architecture: fetch per resource, join in the view

This document describes **what to build and why**. For step-by-step rules and code skeletons,
see [implementation-guide.md](./implementation-guide.md).

The reference implementation lives in `src/app/features/`, but file names and layout in the
target repo differ. Copy the **concept and the boundaries**, not the files.

---

## The problem this solves

The obvious way to render "a debt with its owner's name" is to make the API layer produce it:

```typescript
// ANTI-PATTERN — do not do this
getDebtsWithOwners() {
  return this.http.get<Debt[]>('/api/debts').pipe(
    switchMap(debts => /* fetch details */),
    switchMap(details => /* fetch clients */),
    map(([details, clients]) => /* join */),
  );
}
```

This looks harmless at two resources. It fails predictably:

- The join shape is baked into the fetch. The method physically cannot return debts alone.
- Every view that needs a debt drags in clients. The detail view re-fetches clients the list
  view already loaded.
- One method per view appears (`getDebtsWithOwners`, `getDebtWithOwner`), each repeating the join.
- Every new relation adds a `switchMap` level to **every** method.
- A failing `/api/clients` takes down the debts view.

**The fix is to join late**, and to split the join in two:

- **Fetching** is composed in the store, by mixing in a reusable store feature per related
  resource. Each feature is independent; adding one does not touch the others.
- **Presentation** is composed in the view, in a `computed`, through a pure function.

---

## Core rules

1. **One API service per resource.** One method per endpoint. No joins, no cross-resource calls.
2. **A related resource is pulled in as a `signalStoreFeature`**, parameterised with the ids the
   host store needs. The feature owns its own `rxResource`.
3. **Resource features never reach for another resource's store.** They receive ids as an
   argument.
4. **The projection is a pure function** — no DI, no state, shared by `import`, not `inject`.
5. **View models live next to the projection**, never in the transport model file.

Adding a new relation means: one new store feature, one `withFeature(...)` line, one more line in
the view's `computed`. No existing feature changes.

### What NOT to build

Do **not** create a shared facade service or a root store that knows about several resources. The
facade must know both sides, so it grows with every relation, and you are back to the original
problem.

A store feature is not a facade: it is a self-contained slice that takes ids in and produces
signals out. `withClients()` knows nothing about debts — it is handed `() => store.ownerIds()`.

---

## How the composition works

`withClients()` is a custom store feature exported by the `clients` library. It creates its own
`rxResource`, keyed by whatever ids the host supplies:

```typescript
// clients library — public API
export function withClients(ids: () => readonly string[]) {
  return signalStoreFeature(
    withProps(() => { /* rxResource keyed by ids */ }),
    withComputed((store) => ({ clientsById, clientsLoading, clientsError })),
  );
}
```

The host store mixes it in with **`withFeature`**, which hands the store to the factory:

```typescript
export const DebtsStore = signalStore(
  withProps(/* debts rxResource */),
  withComputed(/* debts, isLoading, hasError */),
  withComputed(/* debtsById, ownerIds */),
  withFeature((store) => withClients(() => store.ownerIds())),
  withMethods(/* reload */),
);
```

`DebtsStore` now exposes `clientsById()` alongside `debts()`. The view does the presentation
join:

```typescript
protected readonly rows = computed(() => {
  const clientsById = this.debts.clientsById();
  return this.debts.debts().map((debt) => toDebtRow(debt, clientsById));
});
```

### Why `withFeature` and not an input constraint

NgRx also lets a feature *demand* something from its host:

```typescript
// FRAGILE — do not do this
signalStoreFeature(
  { props: type<{ clientIds: Signal<string[]> }>() },
  /* … */
)
```

Two problems, one cosmetic and one fatal:

- It forces the host to name a computed `clientIds`, coupling the two by identifier.
- **It breaks type inference once the host has more than one preceding feature.** With
  `withProps` + two `withComputed` blocks ahead of it, TypeScript cannot resolve the `signalStore`
  overload, silently falls back to the default generics, and the whole store degrades to an index
  signature — every `store.debts()` becomes an error. This was verified against
  `@ngrx/signals@21.1.1`.

`withFeature` passes the store to the factory instead, so the feature takes ids as an ordinary
argument. No constraint, no naming coupling, no inference cliff.

---

## Layers

Each resource is organised into the same layers. Directory names are a suggestion; the
**separation** is not. Note `debts/store/` versus `clients/feature/` — the name says whether the
resource owns a store of its own or is mixed into someone else's.

| Layer | Contains | Rules |
|---|---|---|
| `model` | Transport interfaces only | Exactly what the API returns. No view models. |
| `api` | One service per resource | One method per endpoint. **No joins, no cross-resource calls.** |
| `store` *or* `feature` | The store, or the store feature it contributes | Exposes signals, never observables. |
| `util` | Pure functions, view models | No DI, no state. Testable without `TestBed`. |
| `view` | Components | Inject the store, compose presentation with `computed`. |

The projection function is the only place two resources meet in the view layer:

```typescript
// util layer of the *consuming* resource (debts), not of clients
export interface DebtRow extends DebtDetail {
  ownerName: string;
}

export function toDebtRow(debt: DebtDetail, clientsById: Map<string, Client>): DebtRow {
  return { ...debt, ownerName: clientFullName(clientsById.get(debt.ownerId)) };
}
```

---

## Dependency rules

These are the rules that make the architecture hold. In an Nx repo they stop being a convention
and become a lint rule — this is the single biggest reason to adopt the split.

**Direction is one-way.** `debts` may depend on `clients`, because it mixes in `withClients()` and
because `toDebtRow` needs `clientFullName`. `clients` must never depend on `debts` or on any other
feature.

**Public API of a resource library:**

| Symbol | Exported? | Why |
|---|---|---|
| `withClients` | Yes | The only way to pull clients into a store. |
| `Client` (model) | Yes | Needed by the projection function signature. |
| `clientFullName` (util) | Yes | The projection primitive. |
| mock interceptor | Yes | The app shell registers it. |
| **`ClientsApi`** | **No** | Keep internal. |

Keeping `ClientsApi` internal is not cosmetic. If it leaks, the first thing anyone (human or
model) will do in the debts library is inject it and hand-roll a client fetch — reintroducing the
API-layer join across two libraries instead of one file.

**Enforce with tags.** Give each library a `scope:<resource>` tag and a `type:<layer>` tag, then
configure `@nx/enforce-module-boundaries` so that:

- `scope:clients` **cannot** depend on `scope:debts` (nor any other feature scope)
- `type:data-access` **cannot** depend on `type:feature`

Do not prescribe a library count here — match whatever convention the repo already uses. Only the
two rules above are mandatory.

---

## Data lifetime and staleness

Nothing is cached for the lifetime of the application. `DebtsStore` is declared as a plain
`signalStore(...)` **without** `providedIn: 'root'`, and listed in `providers` on the parent
`debts` route:

```typescript
{
  path: 'debts',
  providers: [DebtsStore],
  children: [
    { path: '',    loadComponent: /* list */ },
    { path: ':id', loadComponent: /* detail */ },
  ],
}
```

One instance is shared by the list and the detail view, and it is destroyed when the user leaves
the feature. Its debts `rxResource` takes no params and fires exactly once, when the store is
first injected. There is **no `ensureLoaded`** — the store existing *is* the guarantee that the
request went out.

- entering the list → store created → debts + clients fetched
- navigating to detail → same instance → **zero requests**
- deep-link straight to detail → store created → debts + clients fetched
- leaving `/debts` → store destroyed → next visit re-fetches everything

**Clients inherit the host store's lifetime.** `withClients()` creates its `rxResource` inside
`DebtsStore`'s injector, so the clients live and die with the route. This is why the feature must
never be mixed into a root store: that would cache clients for the whole application session.

Because `ownerIds` is derived from every loaded debt, the detail view does not narrow the request
to a single owner — it reuses the set already fetched for the list. A deep-link to a
**non-existent** debt therefore still fetches clients; the debts were loaded anyway, so this costs
one request and keeps the store's shape uniform.

### Do not add a cache

Caching is, by definition, keeping data you know might be stale. Beyond the route scope above,
do not add any.

An accumulating cache (a `requestedIds` array that only ever grows, re-fetching the union) is the
tempting wrong answer: it is unbounded, it goes stale silently, and fetching k ids one at a time
transfers O(k²) bytes. Likewise, no `shareReplay` on a resource fetch and no `providedIn: 'root'`
on a resource store.

---

## Resource contract

The API is **fixed** and cannot currently be changed. Resource names and call order are as
follows.

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/debts` | `Debt[]` | **No `ownerId`.** |
| `GET /api/debts/:id` | `DebtDetail` | `Debt` + `ownerId`. Works standalone. |
| `GET /api/clients?ids=a,b,c` | `Client[]` | Only by id. No "fetch all" variant. |

Call order when rendering the debts list:

1. `GET /api/debts` — get the ids
2. `GET /api/debts/:id` for each debt — the only way to learn `ownerId`
3. `GET /api/clients?ids=<union of ownerIds>` — one call, ids sorted and de-duplicated

### Known API limitations

Every workaround below must carry a `TODO(api):` comment at the boundary where it lives, saying
what to delete once the backend changes.

1. **`GET /api/debts` does not return `ownerId`.** The list must fetch each detail individually
   (N+1). When fixed: drop the `switchMap` + `forkJoin` and return
   `http.get<DebtDetail[]>('/api/debts')`.
2. **A deep-link to one debt fetches all debts**, a direct consequence of (1). Optimising this
   would require a second source of truth in the detail view (map ?? own resource). Not worth it
   while N is small.
3. **`GET /api/clients` has no parameterless variant.** Clients are always requested by an
   explicit, sorted id list.
