'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@ncr/contracts';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';

type Veto = components['schemas']['VetoListadoDto'];

const clave = (id: string) => ['listas-negras', id] as const;

const fecha = (iso: string): string =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/**
 * HU-35 · LA LISTA NEGRA DESDE LA CONSOLA (ETAPA 15-I).
 *
 * RN-06 le da precedencia absoluta sobre cualquier autorización vigente: un
 * visitante con visita válida y un veto activo NO pasa, con motivo
 * `LISTA_NEGRA`. Por eso vetar está a mano de quien ve el incidente (portería,
 * central) y levantar es un acto de administración con autor y momento (RN-07).
 * Se veta una PLACA (LPR) o una PERSONA por su documento (terminal facial).
 */
export const PantallaDeListasNegras = ({
  copropiedadId,
  puedeLevantar,
}: {
  readonly copropiedadId: string;
  readonly puedeLevantar: boolean;
}): JSX.Element => {
  const consultas = useQueryClient();
  const vetos = useQuery({
    queryKey: clave(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/listas-negras', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  const [nuevo, setNuevo] = useState(false);
  const [levantar, setLevantar] = useState<Veto | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const levantarVeto = async (): Promise<void> => {
    if (levantar === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/listas-negras/{vetoId}/levantamiento', {
          params: { path: { id: copropiedadId, vetoId: levantar.id } },
        }),
      );
      await consultas.invalidateQueries({ queryKey: clave(copropiedadId) });
      setLevantar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo levantar.');
    } finally {
      setEnviando(false);
    }
  };

  const columnas: readonly Columna<Veto>[] = [
    {
      clave: 'quien',
      titulo: 'Vetado',
      celda: (v) =>
        v.placa !== null ? (
          <span className="font-mono">{v.placa}</span>
        ) : (
          `${v.persona ?? 'Persona'}${v.documento === null ? '' : ` · ${v.documento}`}`
        ),
      texto: (v) => `${v.placa ?? ''} ${v.persona ?? ''} ${v.documento ?? ''}`,
    },
    { clave: 'motivo', titulo: 'Motivo', celda: (v) => v.motivo, texto: (v) => v.motivo },
    { clave: 'desde', titulo: 'Desde', celda: (v) => fecha(v.creadoEn) },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (v) =>
        puedeLevantar ? (
          <Boton variante="fantasma" tamano="sm" onClick={() => setLevantar(v)}>
            Levantar
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Listas negras</h1>
          <p className="text-sm text-texto-suave">
            Un veto activo niega el paso aunque haya una autorización vigente (RN-06).
          </p>
        </div>
        <Boton onClick={() => setNuevo(true)}>Vetar</Boton>
      </div>
      <TablaDeDatos
        titulo="Vetos activos"
        columnas={columnas}
        filas={vetos.data ?? []}
        claveDeFila={(v) => v.id}
        cargando={vetos.isPending}
        vacio={{
          titulo: 'Nadie está vetado',
          descripcion: 'Un veto se crea con «Vetar»: una placa o el documento de una persona.',
        }}
        buscador={{ marcador: 'Buscar por placa, nombre o documento' }}
      />
      <DialogoDeVeto
        copropiedadId={copropiedadId}
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
      />
      <DialogoDeConfirmacion
        abierto={levantar !== null}
        titulo="Levantar el veto"
        descripcion="Desde este momento vuelve a decidir la autorización. Queda con su autor y su hora (RN-07)."
        etiquetaConfirmar="Levantar"
        sinMotivo
        enviando={enviando}
        error={error}
        alConfirmar={() => void levantarVeto()}
        alCancelar={() => setLevantar(null)}
      />
    </div>
  );
};

const DialogoDeVeto = ({
  copropiedadId,
  abierto,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [placa, setPlaca] = useState('');
  const [documento, setDocumento] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPlaca('');
    setDocumento('');
    setMotivo('');
    setError(undefined);
  }, [abierto]);

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/listas-negras', {
          params: { path: { id: copropiedadId } },
          body: {
            motivo: motivo.trim(),
            ...(placa.trim() === '' ? {} : { placa: placa.trim() }),
            ...(documento.trim() === '' ? {} : { documento: documento.trim() }),
          },
        }),
      );
      await consultas.invalidateQueries({ queryKey: clave(copropiedadId) });
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vetar.');
    } finally {
      setEnviando(false);
    }
  };

  const unaDeLasDos = placa.trim() !== '' || documento.trim() !== '';
  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Vetar"
      descripcion="Una placa (la cámara la niega) o el documento de una persona (la terminal la niega). El motivo queda con su autor."
      etiquetaEnviar="Vetar"
      enviando={enviando}
      error={error}
      puedeEnviar={unaDeLasDos && motivo.trim().length >= 3}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <div className="space-y-3">
        <Campo
          etiqueta="Placa"
          name="placa"
          autoCapitalize="characters"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <Campo
          etiqueta="Documento de la persona"
          name="documento"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          ayuda="Se busca en esta copropiedad. Deje vacío si veta sólo una placa."
        />
        <Campo
          etiqueta="Motivo"
          name="motivo"
          required
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
    </DialogoDeFormulario>
  );
};
