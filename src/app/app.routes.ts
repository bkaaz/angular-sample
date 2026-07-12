import { Routes } from '@angular/router';
import { DebtsStore } from './features/debts/store/debts.store';

export const routes: Routes = [
  {
    path: 'debts',
    // Scoped here, not in root: list and detail share one instance, and it is destroyed
    // when the user leaves the feature.
    providers: [DebtsStore],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/debts/view/debts-list.component').then(
            (m) => m.DebtsListComponent
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/debts/view/debt-detail.component').then(
            (m) => m.DebtDetailComponent
          ),
      },
    ],
  },
  {
    path: '',
    redirectTo: 'debts',
    pathMatch: 'full',
  },
];
