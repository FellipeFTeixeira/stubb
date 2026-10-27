import { createBrowserRouter, type RouteObject } from 'react-router';
import { OrganizerLayout } from '@/app/organizer-layout';
import { RootLayout } from '@/app/root-layout';
import { DiagnosticsPage } from '@/pages/diagnostics-page';
import { EventPage } from '@/pages/event-page';
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
      {
        path: 'produtor',
        element: <OrganizerLayout />,
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
