import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-3 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted font-medium');

export function OrganizerLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Área do produtor" className="flex gap-2">
        <NavLink to="/produtor/eventos" className={linkClass}>
          Meus eventos
        </NavLink>
        <NavLink to="/produtor/locais" className={linkClass}>
          Locais
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
