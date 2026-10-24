import { createBrowserRouter } from 'react-router';
import { DiagnosticsPage } from '@/pages/diagnostics-page';

export const router = createBrowserRouter([{ path: '/', element: <DiagnosticsPage /> }]);
