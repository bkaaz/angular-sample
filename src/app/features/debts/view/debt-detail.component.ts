import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DebtsStore } from '../store/debts.store';
import { toDebtRow } from '../util/debt-row.util';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <a routerLink="/debts">&larr; Powrót do listy</a>

    <h1>Szczegóły długu</h1>

    @if (isLoading()) {
      <p>Ładowanie...</p>
    } @else if (hasError()) {
      <p style="color: red">Błąd ładowania danych.</p>
    } @else if (debt(); as debt) {
      <table border="1" cellpadding="6" cellspacing="0" style="margin-top: 1rem; border-collapse: collapse;">
        <tbody>
          <tr><th>Właściciel</th><td>{{ debt.ownerName }}</td></tr>
          <tr><th>Kwota</th><td>{{ debt.amount }} {{ debt.currency }}</td></tr>
          <tr><th>Termin</th><td>{{ debt.dueDate | date: 'dd.MM.yyyy' }}</td></tr>
          <tr><th>Status</th><td>{{ debt.status }}</td></tr>
          <tr><th>Opis</th><td>{{ debt.description }}</td></tr>
        </tbody>
      </table>
    } @else {
      <p>Nie znaleziono długu o id {{ id() }}.</p>
    }
  `,
})
export class DebtDetailComponent {
  /** Bound to the `:id` route param by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly debts = inject(DebtsStore);

  protected readonly debt = computed(() => {
    const detail = this.debts.debtsById().get(this.id());
    return detail ? toDebtRow(detail, this.debts.clientsById()) : null;
  });

  // `debt()` is also null while loading, so the template must gate on this before
  // deciding the debt does not exist.
  protected readonly isLoading = computed(
    () => this.debts.isLoading() || this.debts.clientsLoading()
  );

  protected readonly hasError = computed(
    () => this.debts.hasError() || this.debts.clientsError()
  );
}
