import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { clientsMockInterceptor } from './features/clients/api/clients-mock.interceptor';
import { debtsMockInterceptor } from './features/debts/api/debts-mock.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([debtsMockInterceptor, clientsMockInterceptor])),
  ],
};
