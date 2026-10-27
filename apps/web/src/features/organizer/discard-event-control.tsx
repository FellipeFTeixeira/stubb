import type { CommandAccepted } from '@stubb/contracts';
import { useState } from 'react';
import { discardEvent } from '@/api/catalog-organizer';
import { Button } from '@/components/ui/button';
import { CommandButton } from './command-button';

type Props = {
  eventId: string;
  onAccepted: (result: CommandAccepted) => void;
};

// Descarte é definitivo: pede confirmação na própria tela antes de enviar o command (I-10).
export function DiscardEventControl({ eventId, onAccepted }: Props) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        Descartar evento
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Confirmação de descarte">
      <p className="text-sm">
        O evento e todas as suas sessões, setores e lotes serão apagados de forma definitiva.
      </p>
      <div className="flex gap-2">
        <CommandButton
          label="Confirmar descarte"
          variant="destructive"
          variables={{ eventId }}
          send={(v, key) => discardEvent(v.eventId, key)}
          onAccepted={onAccepted}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
