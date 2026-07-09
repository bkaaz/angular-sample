import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { Client } from '../model/client.model';

const MOCK_CLIENTS: Client[] = [
  { id: 'c1', firstName: 'Jan', lastName: 'Kowalski' },
  { id: 'c2', firstName: 'Anna', lastName: 'Nowak' },
  { id: 'c3', firstName: 'Piotr', lastName: 'Wiśniewski' },
];

export const clientsMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || req.url !== '/api/clients') return next(req);

  const idsParam = req.params.get('ids');
  const ids = idsParam ? idsParam.split(',') : [];
  const clients = MOCK_CLIENTS.filter((c) => ids.includes(c.id));

  return of(new HttpResponse({ status: 200, body: clients }));
};
