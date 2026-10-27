import { Button } from '@/components/ui/button';

type Props = {
  status: 'idle' | 'waiting' | 'synced' | 'timed-out';
  onRestart: () => void;
};

// Read-your-writes na tela: o command já foi aceito; aqui o usuário vê se a projeção alcançou.
export function ProjectionStatus({ status, onRestart }: Props) {
  if (status === 'idle') return null;
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
      {status === 'waiting' && <span>Aguardando projeção…</span>}
      {status === 'synced' && <span>Salvo.</span>}
      {status === 'timed-out' && (
        <>
          <span>Salvo. Os dados podem demorar a aparecer.</span>
          <Button type="button" variant="outline" size="sm" onClick={onRestart}>
            Atualizar
          </Button>
        </>
      )}
    </p>
  );
}
