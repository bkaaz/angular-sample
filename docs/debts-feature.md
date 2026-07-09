# Debts Feature — Architecture

## Layers

```
HTTP / mock interceptor
    │
    ▼
DebtsApi (service)            ← ALL HTTP orchestration for this feature
    │   shareReplay(1) cache for /api/clients
    │
    ├──► DebtsStore            ← root singleton, debt list with owner names
    │
    └──► DebtDetailStore       ← component-scoped, single debt with owner name
```

---

## DebtsApi  `@Injectable({ providedIn: 'root' })`

The "fat facade" — all HTTP logic lives here, including `forkJoin` chaining and
`shareReplay(1)` caching. Stores and components never hold URLs or call `HttpClient` directly.

```
getDebtsWithOwners()    → Observable<DebtWithOwner[]>   parallel: list + N details + clients
getDebtWithOwner(id)    → Observable<DebtWithOwner>     parallel: single detail + clients
```

**Clients cache:** `clients$` is a `shareReplay(1)` Observable created once at service
construction. Both `getDebtsWithOwners` and `getDebtWithOwner` use it via `clientsMap$()`.
The actual `/api/clients` HTTP call fires only once per application lifetime, no matter how
many times the methods above are called.

**Why it exists:** when the real API arrives, only `DebtsApi` changes. Stores and components
are unaffected.

Currently, `debts-mock.interceptor.ts` intercepts all calls and returns in-memory data.
Deleting the interceptor and removing it from `app.config.ts` is all that's needed to switch.

---

## DebtsStore  `providedIn: 'root'`

Root singleton. Owns the debt list.

```typescript
withProps(() => {
  const api = inject(DebtsApi);         // captured in injection context
  return {
    _resource: rxResource<DebtWithOwner[], void>({
      stream: () => api.getDebtsWithOwners(),  // api by closure, NOT inject() here
    }),
  };
})
```

Exposes: `debts()`, `isLoading()`, `hasError()`, `reload()`, `selectDebt(id)`.

---

## DebtDetailStore  component-scoped (`providers: [DebtDetailStore]`)

Owns a single debt detail, loaded reactively from the route param.

```typescript
withProps(() => {
  const api = inject(DebtsApi);
  const route = inject(ActivatedRoute);
  const debtId = toSignal(
    route.paramMap.pipe(map((p) => p.get('id') ?? undefined)),
    { initialValue: undefined as string | undefined }
  );
  return {
    _resource: rxResource<DebtWithOwner, string | undefined>({
      params: () => debtId(),
      stream: ({ params: id }) => api.getDebtWithOwner(id),
    }),
  };
})
```

`params` returning `undefined` puts the resource in `idle` state — no HTTP call fires until
a real `id` is available. Note: `null` does NOT trigger idle; only `undefined` does.

`/api/clients` is **not** re-fetched on navigation — `DebtsApi.clients$` is already resolved
and `shareReplay(1)` replays the cached result to the new subscriber immediately.

Exposes: `debt()`, `isLoading()`, `hasError()`.

---

## debt.utils.ts

```typescript
toDebtWithOwner(detail: DebtDetail, clientsMap: Map<string, Client>): DebtWithOwner
```

Single place where a `DebtDetail` and a `Client` are joined into `ownerName`. Called by
`DebtsApi` for both list and detail paths.

---

## What changes when the API improves

| Change | Files affected |
|---|---|
| `/api/debts` returns `ownerId` directly | `DebtsApi.getDebtsWithOwners()` (remove inner forkJoin) |
| `/api/debts/:id` returns `ownerName` directly | `DebtsApi` (remove clients fetch), `debt.utils.ts` (can delete) |
| Real backend replaces mock | delete `debts-mock.interceptor.ts`, remove from `app.config.ts` |
| New feature needs client data | inject `DebtsApi`, call `clientsMap$()` — no new HTTP call |

---

## File map

```
features/debts/
  debts-api.service.ts       ← HTTP layer + shareReplay cache (fat facade)
  debt.model.ts              ← Debt, DebtDetail, Client, DebtWithOwner interfaces
  debt.utils.ts              ← toDebtWithOwner()
  debts-mock.interceptor.ts  ← mock data (delete when real API is ready)
  debts.store.ts             ← DebtsStore (root singleton)
  debt-detail.store.ts       ← DebtDetailStore (component-scoped)
  debts-list.component.ts    ← list view
  debt-detail.component.ts   ← detail view
```
