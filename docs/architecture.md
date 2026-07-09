# Architecture: one store per resource

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

Moving that join into one big store does not fix it. It relocates it. The store then grows a
field and a join per relation, and the detail view still drags in the list's concerns.

**The fix is to join late.** Fetch each resource independently, compose in the view.

---

## Core rules

1. **One SignalStore per backend resource.** Not per view, not per feature. `DebtsStore` owns
   debts. `ClientsStore` owns clients.
2. **Stores never import each other.** `ClientsStore` must not know that debts exist.
3. **Composition happens in the view**, in a `computed`.
4. **The projection is a pure function** — no DI, no state, shared by `import`, not `inject`.
5. **View models live next to the projection**, never in the transport model file.

Adding a new relation means: one new resource store, one new line in the view's `computed`.
No existing store changes.

### What NOT to build

Do **not** create a shared facade, view store, or "debts-with-clients" service — even when two
views need the same combination. That is where coupling re-accumulates: the facade must know
both resources, so it grows with every relation, and you are back to the original problem.

The only thing shared between two resources is a **pure function**. If two views need the same
projection, export the function. Reconsider a shared abstraction only at a third consumer of
the *identical* projection, and even then prefer another pure function.

---

## Layers

Each resource is organised into the same five layers. Directory names are a suggestion; the
**separation** is not.

| Layer | Contains | Rules |
|---|---|---|
| `model` | Transport interfaces only | Exactly what the API returns. No view models. |
| `api` | One service per resource | One method per endpoint. **No joins, no cross-resource calls.** |
| `store` | One SignalStore per resource | Owns an `rxResource`. Exposes signals, not observables. |
| `util` | Pure functions, view models | No DI, no state. Testable without `TestBed`. |
| `view` | Components | Inject stores, compose with `computed`. |

The projection function is the only place two resources meet. It takes plain data in and
returns plain data out:

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

**Direction is one-way.** `debts` may depend on `clients`, because `toDebtRow` needs
`clientFullName`. `clients` must never depend on `debts` or on any other feature.

**Public API of a resource library:**

| Symbol | Exported? | Why |
|---|---|---|
| `ClientsStore` | Yes | Consumers read `clientsById()`, `isLoading()`. |
| `injectClientsDemand` | Yes | The only way to declare which clients a view needs. |
| `Client` (model) | Yes | Needed by the projection function signature. |
| `clientFullName` (util) | Yes | The projection primitive. |
| mock interceptor | Yes | The app shell registers it. |
| **`ClientsApi`** | **No** | Keep internal. |

Keeping `ClientsApi` internal is not cosmetic. If it leaks, the first thing anyone (human or
model) will do in the debts library is inject it and hand-roll a client fetch — reintroducing
the API-layer join across two libraries instead of one file.

**Enforce with tags.** Give each library a `scope:<resource>` tag and a `type:<layer>` tag,
then configure `@nx/enforce-module-boundaries` so that:

- `scope:clients` **cannot** depend on `scope:debts` (nor any other feature scope)
- `type:data-access` **cannot** depend on `type:feature`

Do not prescribe a library count here — match whatever convention the repo already uses. Only
the two rules above are mandatory.

---

## Data lifetime and staleness

The two stores deliberately have **different** caching behaviour. This is the most important
design decision in the codebase, and it is not an oversight.

### `DebtsStore` — cached for the app session

`providedIn: 'root'` plus a parameterless `rxResource`. A root store is created lazily on first
`inject()`, and its resource fires exactly once. There is therefore **no `ensureLoaded` for
debts** — the store existing *is* the guarantee that the request went out.

- entering the list → first `inject()` → fetch
- navigating to detail → store already alive → **zero requests**
- deep-link straight to detail → first `inject()` → fetch

One path, no branches. Because the API forces the list to fetch every debt detail (see below),
the cache granularity is "all debts", and the detail view needs nothing of its own.

### `ClientsStore` — not cached at all

Clients are held **only** for as long as some living view asks for them. Each view registers a
demand and withdraws it on destroy; the resource parameter is the union of currently live
demands.

- data can never be stale, because it does not outlive the view that asked for it
- request size is bounded by what is on screen, not by session history
- returning to the list re-fetches. **This is the feature, not the cost.**

Caching is, by definition, keeping data you know might be stale. Until there is a defined
freshness window for a resource, do not cache it. An accumulating cache (`requestedIds` that
only ever grows) is tempting and wrong: it is unbounded, it goes stale silently, and fetching
k ids one at a time transfers O(k²) bytes.

### The asymmetry is a known trade-off

Debts are cached and *can* go stale; clients cannot. This is defensible — the N+1 makes
re-fetching debts expensive, and clients are cheap and directly user-visible. But it is a
trade-off, not a law.

If debt staleness matters, the cheapest fix is to provide `DebtsStore` at the route level
instead of `root`, so it dies when the user leaves the debts area. That bounds staleness to a
feature session without touching any other rule in this document.

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
3. **`GET /api/clients` has no parameterless variant.** This happens to suit the no-cache design:
   we fetch exactly what is currently asked for.
