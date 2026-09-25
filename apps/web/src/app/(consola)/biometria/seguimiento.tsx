'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * LO QUE PASA DESPUÉS DE CAPTURAR (A3, ETAPA 15-E).
 *
 * La captura deja el consentimiento PENDIENTE del titular. Esta tarjeta hace
 * las dos cosas que el operador necesita a continuación, y ninguna de las que
 * no debe:
 *
 *  1. **Emitir el enlace** con el que el TITULAR responde desde su propio
 *     teléfono. Se muestra para copiarlo y entregarlo; no se abre aquí.
 *  2. **Comprobar la respuesta y sincronizar** a todas las terminales con
 *     biblioteca de rostros. Si el titular todavía no aceptó, lo dice y no
 *     empuja nada (RN-09).
 *
 * Sigue sin haber un botón de «aceptar»: el consentimiento no es un trámite
 * del operador (RN-10).
 */
interface Enlace {
  readonly url: string | null;
  readonly ruta: string;
  readonly expiraEn: string;
}

interface PorTerminal {
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly sincronizada: boolean;
  readonly detalle: string;
}

interface Total {
  readonly terminales: number;
  readonly sincronizadas: number;
  readonly fallidas: number;
  readonly porTerminal: readonly PorTerminal[];
}

const mensajeDe = (fallo: unknown, porOmision: string): string =>
  fallo instanceof ErrorDeApi ? fallo.message : porOmision;

export const SeguimientoDeConsentimiento = ({
  copropiedadId,
  consentimientoId,
  plantillaId,
}: {
  readonly copropiedadId: string;
  readonly consentimientoId: string;
  readonly plantillaId: string;
}): JSX.Element => {
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [estado, setEstado] = useState<string>('pendiente');
  const [total, setTotal] = useState<Total | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const emitirEnlace = async (): Promise<void> => {
    setOcupado(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/enlace',
          { params: { path: { id: copropiedadId, consentimientoId } } },
        ),
      );
      setEnlace(r as Enlace);
      setCopiado(false);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo emitir el enlace. Inténtelo de nuevo.'));
    } finally {
      setOcupado(false);
    }
  };

  const comprobarYSincronizar = async (): Promise<void> => {
    setOcupado(true);
    setError(undefined);
    setTotal(null);
    try {
      const c = desenvolver(
        await cliente.GET('/copropiedades/{id}/biometria/consentimientos/{consentimientoId}', {
          params: { path: { id: copropiedadId, consentimientoId } },
        }),
      ) as { estado: string };
      setEstado(c.estado);
      if (c.estado !== 'vigente') return;
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion-total',
          {
            params: { path: { id: copropiedadId, plantillaId } },
          },
        ),
      );
      setTotal(r as Total);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo comprobar el consentimiento. Inténtelo de nuevo.'));
    } finally {
      setOcupado(false);
    }
  };

  const textoDelEnlace = enlace === null ? '' : (enlace.url ?? enlace.ruta);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(textoDelEnlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-4 rounded-md border p-4 text-sm" role="status">
      <p className="font-medium">
        Consentimiento solicitado · {estado === 'pendiente' ? 'pendiente del titular' : estado}
      </p>
      <p className="text-muted-foreground">
        La plantilla queda retenida hasta que el titular acepte. Entréguele el enlace: lo abre en su
        teléfono, sin cuenta, y responde él. Nadie responde por él (RN-10).
      </p>

      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" onClick={() => void emitirEnlace()} disabled={ocupado}>
          {enlace === null ? 'Generar enlace para el titular' : 'Generar otro enlace'}
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => void comprobarYSincronizar()}
          disabled={ocupado}
        >
          Comprobar respuesta y sincronizar a todas las terminales
        </Boton>
      </div>

      {enlace !== null && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-muted-foreground">Enlace del titular</span>
            <input
              readOnly
              value={textoDelEnlace}
              aria-label="Enlace del titular"
              className="mt-1 block w-full rounded-md border bg-muted px-2 py-1 font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="secundario" onClick={() => void copiar()}>
              {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
            <span className="text-muted-foreground">
              Caduca el {new Date(enlace.expiraEn).toLocaleString('es-CO')}.
            </span>
          </div>
          {enlace.url === null && (
            <p className="text-muted-foreground">
              Sólo se muestra la ruta porque la API no declara <code>API_URL_PUBLICA</code>.
              Antepóngale la dirección con la que el teléfono del visitante alcanza la API (en
              sitio, <code>http://&lt;IP-del-Mac&gt;:3000</code>).
            </p>
          )}
        </div>
      )}

      {estado !== 'pendiente' && estado !== 'vigente' && (
        <p>
          <Distintivo tono="aviso">Cerrado</Distintivo> El titular respondió «{estado}»: no se
          sincroniza nada.
        </p>
      )}

      {total !== null && (
        <div className="space-y-1">
          <p>
            <Distintivo tono={total.fallidas === 0 ? 'exito' : 'aviso'}>
              {total.sincronizadas} de {total.terminales}
            </Distintivo>{' '}
            {total.terminales === 0
              ? 'Ningún equipo activo declara biblioteca de rostros: sondee la terminal desde su ficha.'
              : 'equipos con biblioteca de rostros tienen la plantilla.'}
          </p>
          <ul className="space-y-1">
            {total.porTerminal.map((t) => (
              <li key={t.dispositivoId} className="flex items-start gap-2">
                <Distintivo tono={t.sincronizada ? 'exito' : 'peligro'}>
                  {t.sincronizada ? 'Sincronizada' : 'Falló'}
                </Distintivo>
                <span>
                  {t.nombre} · {t.detalle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error !== undefined && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
