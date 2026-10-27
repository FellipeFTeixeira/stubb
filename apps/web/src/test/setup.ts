import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// O padrão de 1 s das esperas do Testing Library estoura quando os pacotes rodam em paralelo.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
