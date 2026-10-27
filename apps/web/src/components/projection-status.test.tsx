import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectionStatus } from './projection-status';

describe('ProjectionStatus', () => {
  it('idle não renderiza nada', () => {
    const { container } = render(<ProjectionStatus status="idle" onRestart={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('waiting e synced mostram o texto em uma região de status', () => {
    const { rerender } = render(<ProjectionStatus status="waiting" onRestart={() => undefined} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Aguardando projeção…');
    rerender(<ProjectionStatus status="synced" onRestart={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('timed-out mostra o aviso e o botão Atualizar chama onRestart', async () => {
    const onRestart = vi.fn();
    render(<ProjectionStatus status="timed-out" onRestart={onRestart} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Salvo. Os dados podem demorar a aparecer.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
