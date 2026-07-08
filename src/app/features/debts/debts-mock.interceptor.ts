import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { Client, Debt, DebtDetail } from './debt.model';

const MOCK_DEBTS: Debt[] = [
  { id: '1', amount: 500, currency: 'PLN', dueDate: '2026-08-01', status: 'pending', description: 'Pożyczka na wakacje' },
  { id: '2', amount: 1200, currency: 'PLN', dueDate: '2026-06-15', status: 'overdue', description: 'Zakup laptopa' },
  { id: '3', amount: 300, currency: 'EUR', dueDate: '2026-09-30', status: 'paid', description: 'Obiad w restauracji' },
  { id: '4', amount: 750, currency: 'PLN', dueDate: '2026-07-20', status: 'pending', description: 'Naprawa samochodu' },
];

const MOCK_DEBT_DETAILS: DebtDetail[] = [
  { ...MOCK_DEBTS[0], ownerId: 'c1' },
  { ...MOCK_DEBTS[1], ownerId: 'c2' },
  { ...MOCK_DEBTS[2], ownerId: 'c1' },
  { ...MOCK_DEBTS[3], ownerId: 'c3' },
];

const MOCK_CLIENTS: Client[] = [
  { id: 'c1', firstName: 'Jan', lastName: 'Kowalski' },
  { id: 'c2', firstName: 'Anna', lastName: 'Nowak' },
  { id: 'c3', firstName: 'Piotr', lastName: 'Wiśniewski' },
];

export const debtsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);

  if (req.url === '/api/debts') {
    return of(new HttpResponse({ status: 200, body: MOCK_DEBTS }));
  }

  const debtDetailMatch = req.url.match(/^\/api\/debts\/(\w+)$/);
  if (debtDetailMatch) {
    const detail = MOCK_DEBT_DETAILS.find((d) => d.id === debtDetailMatch[1]);
    return of(new HttpResponse({ status: detail ? 200 : 404, body: detail ?? null }));
  }

  if (req.url === '/api/clients') {
    return of(new HttpResponse({ status: 200, body: MOCK_CLIENTS }));
  }

  return next(req);
};
