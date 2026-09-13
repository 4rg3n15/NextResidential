'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Autorizacion } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo, DistintivoDePlaca } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { BuscadorDePersonas } from '@/componentes/buscador-personas';
import type { PersonaElegida } from '@/componentes/buscador-personas';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useAutorizaciones, useViviendas } from '@/lib/api/consultas';
import { minutosDeHora, problemaDePatron, problemaDeVigencia } from '@/lib/validacion/vigencia';
import { patronEnTexto } from './patron';

/**
 * Visitantes y autorizaciones.
 *
 * **Tarjetas y no tabla**, como el mockup: una autorización se revisa entera
 * —quién, a qué vivienda, hasta cuándo, con qué placa, con cuántos
 * acompañantes— y una fila de tabla obliga a elegir cuatro columnas y esconder
 * el resto. La decisión de aprobar o rechazar se toma sobre el conjunto.
 *
 * **Dos pestañas, y la de historial es explícita.** Activas es lo que alguien
 * quiere al abrir; el historial es la vista cara —trae también revocadas y
 * expiradas— y se pide. No se cargan las dos a la vez: son dos consultas con
 * clave propia y la caché no las mezcla.
 */
export const PantallaDeVisitantes = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [ver, setVer] = useState<'activas' | 'historial'>('activas');
  const consulta = useAutorizaciones(copropiedadId, ver);
  const viviendas = useViviendas(copropiedadId, { estado: 'activo', busqueda: '' });

  const [alta, setAlta] = useState(false);
  const [revocar, setRevocar] = useState<Autorizacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [viviendaId, setViviendaId] = useState('');
  const [persona, setPersona] = useState<PersonaElegida | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [recurrente, setRecurrente] = useState(false);
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('18:00');

  /**
   * **Las restricciones del dominio se señalan AQUÍ, antes de enviarlas.**
   *
   * D-73: el formulario aceptó una vigencia invertida y el error que acabó
   * mostrando fue el de otro campo. Quien decide sigue siendo el dominio —esto
   * no puede relajar nada—, pero una restricción que solo aparece cuando el
   * servidor la nombra obliga a descubrirla por ensayo y error.
   */
  const problemaVigencia = problemaDeVigencia(desde, hasta);
  const problemaPatron = recurrente ? problemaDePatron(dias, horaInicio, horaFin) : null;

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['autorizaciones', copropiedadId] });
  };

  const crear = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/autorizaciones', {
          params: { path: { id: copropiedadId } },
          body: {
            viviendaId,
            personaId: persona?.id ?? '',
            desde: new Date(desde).toISOString(),
            hasta: new Date(hasta).toISOString(),
            ...(recurrente
              ? {
                  patron: {
                    dias,
                    minutoInicio: minutosDeHora(horaInicio) ?? 0,
                    minutoFin: minutosDeHora(horaFin) ?? 0,
                    // El desfase se toma del navegador de quien la crea, que es
                    // el huso en el que está pensando las horas.
                    desplazamientoUtcMinutos: -new Date().getTimezoneOffset(),
                  },
                }
              : {}),
          },
        }),
      );
      setAlta(false);
      setPersona(null);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo crear la autorización');
    } finally {
      setEnviando(false);
    }
  };

  const revocarAhora = async (motivo: string): Promise<void> => {
    if (revocar === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/autorizaciones/{autorizacionId}/revocacion', {
          params: { path: { id: copropiedadId, autorizacionId: revocar.id } },
          body: { motivo },
        }),
      );
      setRevocar(null);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo revocar');
    } finally {
      setEnviando(false);
    }
  };

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e.estado : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  const fecha = (iso: string): string =>
    new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <EncabezadoDePantalla
        titulo="Visitantes y autorizaciones"
        descripcion="Quién puede entrar, a qué vivienda y hasta cuándo. Revocar conserva el registro: no se borra."
        acciones={<Boton onClick={() => setAlta(true)}>Nueva autorización</Boton>}
      />

      <div role="tablist" aria-label="Vista de autorizaciones" className="mb-4 flex gap-2">
        {(['activas', 'historial'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={ver === v}
            onClick={() => setVer(v)}
            className={
              ver === v
                ? 'rounded-distintivo bg-marca-suave px-3 py-1.5 text-secundario font-medium text-marca-texto'
                : 'rounded-distintivo px-3 py-1.5 text-secundario text-texto-apagado hover:bg-lienzo'
            }
          >
            {v === 'activas' ? 'Activas' : 'Historial'}
          </button>
        ))}
      </div>

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando autorizaciones" /> : null}

      {consulta.data !== undefined && consulta.data.length === 0 ? (
        <EstadoVacio
          titulo={ver === 'activas' ? 'Sin autorizaciones activas' : 'Sin historial'}
          descripcion={
            ver === 'activas'
              ? 'Nadie tiene permiso de visita vigente en esta copropiedad.'
              : 'Todavía no se ha registrado ninguna autorización.'
          }
          accion={<Boton onClick={() => setAlta(true)}>Nueva autorización</Boton>}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(consulta.data ?? []).map((a) => (
          <Tarjeta key={a.id}>
            <CabeceraDeTarjeta
              titulo={a.visitante}
              descripcion={`${a.vivienda} · doc. ${a.documento}`}
              accion={
                <Distintivo tono={a.estado === 'activa' ? 'exito' : 'neutro'}>
                  {a.estado === 'activa' ? 'Vigente' : 'Revocada'}
                </Distintivo>
              }
            />
            <CuerpoDeTarjeta className="space-y-2">
              <p className="text-secundario text-texto-apagado">
                {fecha(a.desde)} → {fecha(a.hasta)}
              </p>
              {a.tipo === 'recurrente' && a.patron !== null ? (
                <p className="text-secundario">
                  <Distintivo tono="marca" conIcono={false}>
                    Recurrente
                  </Distintivo>{' '}
                  <span className="text-texto-apagado">{patronEnTexto(a.patron)}</span>
                </p>
              ) : null}
              {a.placa !== null ? <DistintivoDePlaca placa={a.placa} /> : null}
              {a.acompanantes.length > 0 ? (
                <p className="text-secundario text-texto-apagado">
                  Acompañantes: {a.acompanantes.join(', ')}
                </p>
              ) : null}
              {a.estado === 'revocada' ? (
                <p className="text-secundario text-texto-apagado">
                  Revocada{a.revocadaEn === null ? '' : ` el ${fecha(a.revocadaEn)}`}:{' '}
                  {a.motivoRevocacion ?? 'sin motivo registrado'}
                </p>
              ) : (
                <div className="pt-1">
                  <Boton variante="peligro" tamano="sm" onClick={() => setRevocar(a)}>
                    Revocar
                  </Boton>
                </div>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>
        ))}
      </div>

      <DialogoDeFormulario
        abierto={alta}
        titulo="Nueva autorización"
        descripcion="Quién visita, a qué vivienda y entre qué momentos. La vigencia no puede nacer expirada (RN-01)."
        etiquetaEnviar="Autorizar"
        enviando={enviando}
        error={error}
        puedeEnviar={
          viviendaId !== '' &&
          persona !== null &&
          desde !== '' &&
          hasta !== '' &&
          problemaVigencia === null &&
          problemaPatron === null
        }
        alEnviar={() => void crear()}
        alCancelar={() => {
          setAlta(false);
          setError(undefined);
        }}
      >
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Vivienda que autoriza</span>
          <select
            value={viviendaId}
            onChange={(e) => setViviendaId(e.target.value)}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            <option value="">Selecciona una vivienda activa</option>
            {(viviendas.data?.viviendas ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.identificador}
              </option>
            ))}
          </select>
        </label>
        {/* D-72 · el visitante se busca por nombre o documento, y si no está se
            registra aquí mismo. Nadie escribe un identificador interno. */}
        <BuscadorDePersonas
          copropiedadId={copropiedadId}
          elegida={persona}
          alElegir={setPersona}
          ayuda="El visitante entra por su propia identidad: es lo que permite que la lista negra lo alcance (RN-06)."
        />
        <Campo
          etiqueta="Desde"
          type="datetime-local"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          required
        />
        <Campo
          etiqueta="Hasta"
          type="datetime-local"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          // El motivo se pone bajo «Hasta» y no encima del formulario: es este
          // campo el que hay que corregir, y un aviso general obliga a
          // adivinar cuál de los dos está mal.
          error={problemaVigencia ?? undefined}
          required
        />

        <fieldset className="space-y-2 rounded-campo border border-borde p-3">
          <legend className="px-1 text-secundario font-medium text-texto">Repetición</legend>
          <label className="flex items-center gap-2 text-secundario text-texto">
            <input
              type="checkbox"
              checked={recurrente}
              onChange={(e) => setRecurrente(e.target.checked)}
              className="h-4 w-4 accent-marca"
            />
            {/* La etiqueta ya NO anuncia «los días marcados» ni una franja fija:
                antes describía un selector que solo existía tras marcarla y unas
                horas que no se podían cambiar (D-74). */}
            Autorización recurrente
          </label>
          {recurrente ? (
            <>
              <p className="text-secundario text-texto-apagado">
                Vale solo en los días y la franja que marques, dentro de la vigencia (RN-22).
              </p>
              <div
                role="group"
                aria-label="Días de la semana en que aplica"
                className="flex flex-wrap gap-1.5"
              >
                {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={dias.includes(i)}
                    onClick={() =>
                      setDias((previos) =>
                        previos.includes(i) ? previos.filter((x) => x !== i) : [...previos, i],
                      )
                    }
                    className={
                      dias.includes(i)
                        ? 'rounded-distintivo bg-marca-suave px-2 py-1 text-distintivo font-medium text-marca-texto'
                        : 'rounded-distintivo border border-borde px-2 py-1 text-distintivo text-texto-apagado hover:bg-lienzo'
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo
                  etiqueta="Desde la hora"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
                <Campo
                  etiqueta="Hasta la hora"
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  error={problemaPatron ?? undefined}
                />
              </div>
            </>
          ) : null}
        </fieldset>
      </DialogoDeFormulario>

      <DialogoDeConfirmacion
        abierto={revocar !== null}
        titulo={`Revocar la autorización de ${revocar?.visitante ?? ''}`}
        descripcion="Deja de permitir el acceso desde este momento. El registro se conserva con el motivo."
        etiquetaConfirmar="Revocar"
        enviando={enviando}
        error={error}
        sugerencias={['Visita cancelada', 'Solicitada por el residente', 'Comportamiento indebido']}
        alConfirmar={(motivo) => void revocarAhora(motivo)}
        alCancelar={() => {
          setRevocar(null);
          setError(undefined);
        }}
      />
    </>
  );
};
