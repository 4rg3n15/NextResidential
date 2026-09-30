'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EstadoDeVisita, Rol, Visita } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo, DistintivoDePlaca } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { Ayuda } from '@/componentes/ui/ayuda';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { FotografiaDeVisitante } from '@/componentes/fotografia-visitante';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import {
  ROLES_QUE_RECHAZAN,
  RechazoDeVisita,
  sePuedeRechazar,
} from '@/componentes/rechazo-de-visita';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import {
  SIN_FILTROS,
  clavesDeVisitas,
  useFotoEnEquipos,
  useViviendasDeVisitas,
  useVisitas,
} from '@/lib/api/visitas';
import type { FiltrosDeVisitas } from '@/lib/api/visitas';
import { GenerarAutorizacion } from './generar-autorizacion';
import { fechaYHora, rangoDeVisita } from '@/lib/fechas';

const ESTADOS: readonly { valor: EstadoDeVisita; etiqueta: string; tono: TonoDeDistintivo }[] = [
  { valor: 'vigente', etiqueta: 'Vigente', tono: 'exito' },
  { valor: 'programada', etiqueta: 'Programada', tono: 'marca' },
  { valor: 'vencida', etiqueta: 'Vencida', tono: 'neutro' },
  { valor: 'anulada', etiqueta: 'Anulada', tono: 'peligro' },
];
const DEL_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.valor, e])) as Record<
  EstadoDeVisita,
  (typeof ESTADOS)[number]
>;

const EN_EQUIPO = {
  sincronizada: { etiqueta: 'La tiene', tono: 'exito' },
  fallida: { etiqueta: 'No la aceptó', tono: 'peligro' },
  pendiente: { etiqueta: 'Pendiente', tono: 'aviso' },
  suprimida: { etiqueta: 'Retirada', tono: 'neutro' },
  // R1 (15-N) · el equipo no recibe plantillas: se dice, con el porqué.
  omitida: { etiqueta: 'Omitido', tono: 'neutro' },
} as const;

/**
 * F3 (15-L) · en qué equipos está la foto de una visita, y el reintento de los
 * que no la aceptaron. R1 (15-N) · también los que aún no la tienen
 * («pendiente») y los que no la recibirán («omitido», con el porqué), y
 * «Enviar a equipos pendientes», que sólo pide a los que no la tienen.
 */
export const FotoEnEquipos = ({
  copropiedadId,
  visita,
}: {
  readonly copropiedadId: string;
  readonly visita: Visita;
}): JSX.Element => {
  const consultas = useQueryClient();
  const equipos = useFotoEnEquipos(copropiedadId, visita.autorizacionId);
  const [reintentando, setReintentando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const reintentar = async (): Promise<void> => {
    if (visita.plantillaId === null) return;
    setReintentando(true);
    setMensaje(null);
    try {
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion-total',
          {
            params: {
              path: { id: copropiedadId, plantillaId: visita.plantillaId },
              query: { soloPendientes: 'true' },
            },
          },
        ),
      );
      setMensaje(`Enviada a ${String(r.sincronizadas)} de ${String(r.terminales)} equipos.`);
      await consultas.invalidateQueries({ queryKey: clavesDeVisitas.raiz(copropiedadId) });
    } catch (fallo) {
      setMensaje(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setReintentando(false);
    }
  };

  if (equipos.isLoading) return <p className="text-secundario">Consultando los equipos…</p>;
  const filas = equipos.data ?? [];
  return (
    <div className="space-y-2">
      {filas.length === 0 ? (
        <p className="text-secundario text-texto-apagado">
          Ningún equipo con reconocimiento facial tiene registro de esta foto.
        </p>
      ) : (
        <ul className="space-y-1">
          {filas.map((e) => (
            <li key={e.dispositivoId} className="flex flex-wrap items-center gap-2 text-secundario">
              <span className="font-medium text-texto">{e.equipo}</span>
              <Distintivo tono={EN_EQUIPO[e.estado].tono}>
                {EN_EQUIPO[e.estado].etiqueta}
              </Distintivo>
              {(e.estado === 'fallida' || e.estado === 'omitida') && e.detalle !== null ? (
                <span className="text-texto-apagado">{e.detalle}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {visita.plantillaId !== null &&
      sePuedeRechazar(visita) &&
      filas.some((e) => e.estado === 'pendiente' || e.estado === 'fallida') ? (
        <Boton
          tamano="sm"
          variante="secundario"
          disabled={reintentando}
          onClick={() => void reintentar()}
        >
          {reintentando ? 'Enviando…' : 'Enviar a equipos pendientes'}
        </Boton>
      ) : null}
      {mensaje !== null ? (
        <p role="status" className="text-secundario">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
};

/** Una visita: quién, a dónde, cuándo, en qué estado y con qué foto. */
const TarjetaDeVisita = ({
  copropiedadId,
  visita,
  puedeRechazar,
  alRechazar,
}: {
  readonly copropiedadId: string;
  readonly visita: Visita;
  readonly puedeRechazar: boolean;
  readonly alRechazar: (v: Visita) => void;
}): JSX.Element => {
  const [abierta, setAbierta] = useState(false);
  const estado = DEL_ESTADO[visita.estado];
  return (
    <li>
      <Tarjeta>
        <CuerpoDeTarjeta>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-titulo font-semibold text-texto">{visita.visitante}</p>
              <p className="text-secundario text-texto-apagado">
                Documento {visita.documento} · {visita.vivienda}
              </p>
              <p className="text-secundario text-texto">
                {/* C5 (15-M) · la fecha en los DOS extremos: «28-09-2026 06:56 p. m. a 29-09-2026 06:56 a. m.» */}
                {rangoDeVisita(visita.desde, visita.hasta)}
              </p>
              {visita.confirmacionDePlaca !== null ? (
                <p className="text-secundario text-texto">{visita.confirmacionDePlaca}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Distintivo tono={estado.tono}>{estado.etiqueta}</Distintivo>
                {visita.placa !== null ? <DistintivoDePlaca placa={visita.placa} /> : null}
                {visita.tieneFoto ? (
                  <Distintivo tono={visita.equiposFallidos > 0 ? 'aviso' : 'neutro'}>
                    Foto en {String(visita.equiposSincronizados)} equipos
                    {visita.equiposFallidos > 0
                      ? ` · ${String(visita.equiposFallidos)} fallaron`
                      : ''}
                  </Distintivo>
                ) : (
                  <Distintivo tono="aviso">Sin foto</Distintivo>
                )}
              </div>
              {visita.estado === 'anulada' && visita.motivoAnulacion !== null ? (
                <p className="text-secundario text-peligro-texto">
                  Anulada: {visita.motivoAnulacion}
                </p>
              ) : null}
              <p className="text-distintivo text-texto-apagado">
                Generada por {visita.generadaPor ?? 'la app del residente'} el{' '}
                {fechaYHora(visita.generadaEn)}
                {visita.casillaDeclaradaPor !== null ? (
                  <>
                    {' '}
                    · casilla marcada por {visita.casillaDeclaradaPor}
                    <Ayuda texto="Quien generó la visita declaró que el visitante autorizó el uso de su foto." />
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton tamano="sm" variante="secundario" onClick={() => setAbierta((a) => !a)}>
                {abierta ? 'Ocultar detalle' : 'Ver detalle'}
              </Boton>
              {puedeRechazar && sePuedeRechazar(visita) ? (
                <Boton tamano="sm" variante="peligro" onClick={() => alRechazar(visita)}>
                  Rechazar
                </Boton>
              ) : null}
            </div>
          </div>

          {abierta ? (
            <div className="mt-4 grid gap-4 border-t border-borde pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-etiqueta font-medium text-texto">Foto</p>
                {visita.tieneFoto ? (
                  <FotografiaDeVisitante
                    copropiedadId={copropiedadId}
                    autorizacionId={visita.autorizacionId}
                    visitante={visita.visitante}
                    tieneFotografia
                  />
                ) : (
                  <p className="text-secundario text-texto-apagado">Esta visita no tiene foto.</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-etiqueta font-medium text-texto">Equipos</p>
                <FotoEnEquipos copropiedadId={copropiedadId} visita={visita} />
              </div>
            </div>
          ) : null}
        </CuerpoDeTarjeta>
      </Tarjeta>
    </li>
  );
};

/**
 * VISITANTES · F1, F2, F3, F5 y F7 (15-L).
 *
 * «Generar autorización» para todos los roles. La lista cambia según quién
 * mira, y lo decide la API, no esta pantalla: portería ve SÓLO las visitas de
 * hoy —se reinicia sola a medianoche, sin borrar nada— y administración ve el
 * historial completo con filtros por vivienda, fechas, estado y texto.
 */
export const PantallaDeVisitantes = ({
  copropiedadId,
  rol,
}: {
  readonly copropiedadId: string;
  readonly rol: Rol;
}): JSX.Element => {
  const [filtros, setFiltros] = useState<FiltrosDeVisitas>(SIN_FILTROS);
  const consulta = useVisitas(copropiedadId, filtros);
  const viviendas = useViviendasDeVisitas(copropiedadId);
  const [generando, setGenerando] = useState(false);
  const [rechazo, setRechazo] = useState<Visita | null>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  // La API decide; la pantalla no ofrece filtros que la API va a ignorar.
  const soloElDia =
    rol === 'portero' || rol === 'operador_central' || (consulta.data?.soloElDia ?? false);
  const puedeRechazar = ROLES_QUE_RECHAZAN.has(rol);
  const cambiar = (campo: keyof FiltrosDeVisitas, valor: string): void =>
    setFiltros((f) => ({ ...f, [campo]: valor }));

  const error = consulta.error;
  const visitas = consulta.data?.visitas ?? [];

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Visitantes"
        descripcion={
          soloElDia
            ? 'Las visitas de hoy. La lista empieza de nuevo a medianoche; el historial se conserva.'
            : 'Historial de visitas de la copropiedad, con filtros por vivienda, fechas y estado.'
        }
        acciones={<Boton onClick={() => setGenerando(true)}>Generar autorización</Boton>}
      />

      <Tarjeta>
        <CuerpoDeTarjeta>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Campo
                etiqueta="Buscar por nombre o documento"
                name="texto"
                value={filtros.texto}
                onChange={(e) => cambiar('texto', e.target.value)}
              />
            </div>
            {soloElDia ? null : (
              <>
                <label className="block space-y-1.5">
                  <span className="block text-etiqueta font-medium text-texto">Vivienda</span>
                  <select
                    name="viviendaId"
                    value={filtros.viviendaId}
                    onChange={(e) => cambiar('viviendaId', e.target.value)}
                    className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
                  >
                    <option value="">Todas</option>
                    {(viviendas.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <Campo
                  etiqueta="Desde"
                  name="desde"
                  type="date"
                  value={filtros.desde}
                  onChange={(e) => cambiar('desde', e.target.value)}
                />
                <Campo
                  etiqueta="Hasta"
                  name="hasta"
                  type="date"
                  value={filtros.hasta}
                  onChange={(e) => cambiar('hasta', e.target.value)}
                />
                <label className="block space-y-1.5">
                  <span className="block text-etiqueta font-medium text-texto">Estado</span>
                  <select
                    name="estado"
                    value={filtros.estado}
                    onChange={(e) => cambiar('estado', e.target.value)}
                    className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
                  >
                    <option value="">Todos</option>
                    {ESTADOS.map((e) => (
                      <option key={e.valor} value={e.valor}>
                        {e.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </CuerpoDeTarjeta>
      </Tarjeta>

      {resumen !== null ? (
        <p role="status" className="rounded-md border border-borde p-3 text-secundario">
          {resumen}
        </p>
      ) : null}

      {consulta.isLoading ? (
        <EstadoCargando etiqueta="Cargando las visitas…" />
      ) : error !== null ? (
        estadoSegunCodigo(error instanceof ErrorDeApi ? error : 0, error.message, () => {
          void consulta.refetch();
        })
      ) : visitas.length === 0 ? (
        <EstadoVacio
          titulo={soloElDia ? 'Sin visitas hoy' : 'Sin visitas con esos filtros'}
          descripcion="Use «Generar autorización» para registrar una."
        />
      ) : (
        <ul className="space-y-3" aria-label="Visitas">
          {visitas.map((v) => (
            <TarjetaDeVisita
              key={v.autorizacionId}
              copropiedadId={copropiedadId}
              visita={v}
              puedeRechazar={puedeRechazar}
              alRechazar={setRechazo}
            />
          ))}
        </ul>
      )}

      <GenerarAutorizacion
        copropiedadId={copropiedadId}
        abierto={generando}
        alCerrar={() => setGenerando(false)}
      />
      {rechazo !== null ? (
        <RechazoDeVisita
          copropiedadId={copropiedadId}
          visita={rechazo}
          alTerminar={(texto) => {
            setRechazo(null);
            if (texto !== null) setResumen(texto);
          }}
        />
      ) : null}
    </div>
  );
};
