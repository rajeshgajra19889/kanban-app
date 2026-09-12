import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login) },
  { path: '', redirectTo: 'boards', pathMatch: 'full' },
  {
    path: 'boards',
    loadComponent: () => import('./boards/boards').then((m) => m.Boards),
    canActivate: [authGuard],
  },
  {
    path: 'b/:id',
    loadComponent: () => import('./board/board').then((m) => m.Board),
    canActivate: [authGuard],
  },
];