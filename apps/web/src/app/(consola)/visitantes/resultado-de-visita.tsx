import type { JSX } from 'react';
import type { VisitaGenerada } from '@ncr/contracts';

/**
 * Lo que dice «Generar autorización» al terminar: la confirmación de la placa
 * tal como la escribe la API (C9, 15-M) y, si la visita llevaba foto, a cuántos
 * equipos llegó y cuáles no la aceptaron (F3). Sin foto (D-143) no hay nada
 * que contar de los equipos: la visita vale por placa.
 */
export const ResultadoDeVisita = ({
  visita,
  conFoto,
}: {
  readonly visita: VisitaGenerada;
  readonly conFoto: boolean;
}): JSX.Element => (
  <div role="status" className="space-y-1 rounded-md border border-borde p-3 text-secundario">
    <p className="font-medium text-texto">Autorización generada.</p>
    {visita.confirmacionDePlaca !== null ? (
      <p role="status" className="font-medium text-exito-texto">
        {visita.confirmacionDePlaca}
      </p>
    ) : null}
    {conFoto ? (
      <>
        <p>
          Foto enviada a {String(visita.sincronizadas)} de {String(visita.equipos)} equipos
          {visita.fallidas > 0 ? `; ${String(visita.fallidas)} no la aceptaron` : ''}.
        </p>
        {visita.porEquipo
          .filter((e) => !e.sincronizada)
          .map((e) => (
            <p key={e.dispositivoId} className="text-aviso-texto">
              {e.nombre}: {e.detalle}
            </p>
          ))}
        {visita.avisoDeSincronizacion !== null ? (
          <p className="text-aviso-texto">{visita.avisoDeSincronizacion}</p>
        ) : null}
      </>
    ) : (
      <p>Sin foto: el visitante entra por la placa, no por reconocimiento facial.</p>
    )}
  </div>
);
