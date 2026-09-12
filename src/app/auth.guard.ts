import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { KanbanService } from './kanban.service';

export const authGuard: CanActivateFn = async () => {
  const svc = inject(KanbanService);
  const router = inject(Router);
  const ok = await svc.checkSession();
  if (!ok) {
    return router.createUrlTree(['/login']);
  }
  return true;
};