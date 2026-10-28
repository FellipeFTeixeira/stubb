import { createBrowserRouter, type RouteObject } from 'react-router';
import { OrganizerLayout } from '@/app/organizer-layout';
import { RootLayout } from '@/app/root-layout';
import { DiagnosticsPage } from '@/pages/diagnostics-page';
import { EventPage } from '@/pages/event-page';
import { RequireAuth, RequireRole } from '@/features/session/route-guards';
import { AccountPage } from '@/pages/identity/account-page';
import { AdminOrganizerRequestsPage } from '@/pages/identity/admin-organizer-requests-page';
import { LoginPage } from '@/pages/identity/login-page';
import { RegisterPage } from '@/pages/identity/register-page';
import { VerifyEmailPage } from '@/pages/identity/verify-email-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { EventManagePage } from '@/pages/organizer/event-manage-page';
import { OrganizerEventsPage } from '@/pages/organizer/events-page';
import { NewEventPage } from '@/pages/organizer/new-event-page';
import { NewVenuePage } from '@/pages/organizer/new-venue-page';
import { VenuePage } from '@/pages/organizer/venue-page';
import { VenuesPage } from '@/pages/organizer/venues-page';
import { ShowcasePage } from '@/pages/showcase-page';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <ShowcasePage /> },
      { path: 'eventos/:eventId', element: <EventPage /> },
      { path: 'entrar', element: <LoginPage /> },
      { path: 'cadastro', element: <RegisterPage /> },
      { path: 'verificar-email', element: <VerifyEmailPage /> },
      {
        path: 'conta',
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/produtores',
        element: (
          <RequireRole role="admin">
            <AdminOrganizerRequestsPage />
          </RequireRole>
        ),
      },
      {
        path: 'produtor',
        element: (
          <RequireRole role="organizer">
            <OrganizerLayout />
          </RequireRole>
        ),
        children: [
          { path: 'eventos', element: <OrganizerEventsPage /> },
          { path: 'eventos/novo', element: <NewEventPage /> },
          { path: 'eventos/:eventId', element: <EventManagePage /> },
          { path: 'locais', element: <VenuesPage /> },
          { path: 'locais/novo', element: <NewVenuePage /> },
          { path: 'locais/:venueId', element: <VenuePage /> },
        ],
      },
      { path: 'diagnostico', element: <DiagnosticsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
