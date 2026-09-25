'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Equipo, ResultadoDeSondeo } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { EstadoCargando } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { FichaDeEquipo } from './ficha-del-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * O4 · LA FICHA DE UN EQUIPO EN SERVICIO
 *
 * Hasta ahora la ficha sólo se veía en el alta, con la clave recién tecleada;
 * un equipo instalado no tenía forma de volver a diagnosticarse. Aquí el
 * SERVIDOR lo sondea con la clave guardada —que no viaja al navegador—, la
 * ficha llega ya por tipo (una terminal trae verificación remota y biblioteca;
 * un videoportero, apertura y canal de audio) y las correcciones se aplican
 * desde el mismo sitio, con motivo y con constancia (§6.1).
 */
const VERDE = 'border-exito bg-exito-suave text-exito-texto';
const ROJO = 'border-peligro bg-peligro-suave text-peligro-texto';
const AMBAR = 'border-aviso bg-aviso-suave text-aviso-texto';
const TONO: Readonly<Record<string, string>> = {
  alcanzado: VERDE,
  decide_solo: ROJO,
  credencial: ROJO,
  inalcanzable: AMBAR,
};

export const MINIMO_MOTIVO_DE_CORRECCION = 5;

export const FichaDialogo = ({
  copropiedadId,
  equipo,
  alCerrar,
}: {
  readonly copropiedadId: string;
  /** `null` = cerrado. */
  readonly equipo: Equipo | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [sondeo, setSondeo] = useState<ResultadoDeSondeo | null>(null);
  const [sondeando, setSondeando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const sondear = async (id: string): Promise<void> => {
    setSondeando(true);
    setError(undefined);
    try {
      setSondeo(
        desenvolver(
          await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/diagnostico', {
            params: { path: { id: copropiedadId, equipoId: id } },
          }),
        ),
      );
      // La verificación y las capacidades acaban de cambiar en el inventario.
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
    } catch (e) {
      setSondeo(null);
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo sondear el equipo');
    } finally {
      setSondeando(false);
    }
  };

  // Al abrir se sondea una vez; volver a hacerlo es el botón de envío.
  useEffect(() => {
    if (equipo === null) return;
    setSondeo(null);
    setMotivo('');
    setAviso(null);
    void sondear(equipo.id);
    // Lo que decide es el equipo abierto: `sondear` cambia con cada render.
  }, [equipo?.id]);

  const corregir = async (correccion: string): Promise<void> => {
    if (equipo === null) return;
    setCorrigiendo(correccion);
    setError(undefined);
    setAviso(null);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/correcciones', {
          params: { path: { id: copropiedadId, equipoId: equipo.id } },
          body: { correccion: correccion as never, motivo: motivo.trim() },
        }),
      );
      setAviso(
        r.aplicada
          ? `${r.detalle}. Antes: ${r.valorAnterior ?? '(sin valor)'} → ahora: ${r.valorNuevo ?? '(sin cambio)'}. Queda constancia de quién y cuándo.`
          : r.detalle,
      );
      // Se vuelve a sondear para que la ficha enseñe lo que el equipo dice AHORA.
      await sondear(equipo.id);
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo aplicar la corrección');
    } finally {
      setCorrigiendo(null);
    }
  };

  const puedeCorregir = motivo.trim().length >= MINIMO_MOTIVO_DE_CORRECCION;

  return (
    <DialogoDeFormulario
      abierto={equipo !== null}
      titulo={`Ficha de ${equipo?.nombre ?? ''}`}
      descripcion="Lo que el equipo declara, comprobado ahora mismo por el servidor con la clave guardada. Sin comprobar no es correcto: lo que no contestó se dice."
      etiquetaEnviar="Volver a sondear"
      enviando={sondeando}
      error={error}
      puedeEnviar={equipo !== null && !sondeando && corrigiendo === null}
      alEnviar={() => {
        if (equipo !== null) void sondear(equipo.id);
      }}
      alCancelar={alCerrar}
    >
      {sondeo === null && sondeando ? <EstadoCargando etiqueta="Sondeando el equipo" /> : null}

      {sondeo === null ? null : (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-secundario ${TONO[sondeo.clase] ?? AMBAR}`}
        >
          {sondeo.detalle}
          {sondeo.latenciaMs === null ? '' : ` · ${String(Math.round(sondeo.latenciaMs))} ms`}
        </p>
      )}

      {aviso !== null ? (
        <p
          role="status"
          className="rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto"
        >
          {aviso}
        </p>
      ) : null}

      {sondeo?.ficha === undefined ? null : (
        <>
          <Campo
            etiqueta="Motivo de la corrección"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            ayuda={`Obligatorio para corregir algo en el equipo: queda en la auditoría junto al valor anterior y el nuevo. Mínimo ${String(MINIMO_MOTIVO_DE_CORRECCION)} caracteres.`}
          />
          <FichaDeEquipo
            ficha={sondeo.ficha}
            corrigiendo={corrigiendo}
            {...(puedeCorregir ? { alCorregir: (c: string) => void corregir(c) } : {})}
          />
        </>
      )}
    </DialogoDeFormulario>
  );
};
