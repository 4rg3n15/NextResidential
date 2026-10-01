'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Equipo, ResultadoDeSondeo } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { EstadoCargando } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { FichaDeEquipo } from './ficha-del-equipo';
import { Boton } from '@/componentes/ui/boton';
import { VideoEnVivo } from '@/componentes/video-en-vivo';
import { AccionesDeSitio } from './acciones-de-sitio';
import { SalidasDelVideoportero } from './salidas-del-equipo';

/** D3 (15-L) · los equipos que entregan video por RTSP. */
const CON_VIDEO = new Set<Equipo['tipo']>(['camara_lpr', 'terminal_facial', 'intercom']);

/** DD-MM-YYYY, como lo pide la ficha («dato del …»). */
export const fechaCorta = (iso: string): string => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${String(d.getFullYear())}`;
};

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
  // D3 (15-L) · el video se pide al pulsar, no al abrir: negociar por cada
  // ficha que alguien mira ocuparía el puente y el equipo sin motivo.
  const [conVideo, setConVideo] = useState(false);
  useEffect(() => setConVideo(false), [equipo]);

  /**
   * Otros fallos (15-M) · el equipo que está abierto AHORA. Un sondeo lento de
   * otra ficha —cerrada con Esc mientras sondeaba— no puede pintarse en ésta:
   * la ficha de B enseñaba el diagnóstico de A y las correcciones iban a B.
   */
  const abierto = useRef<string | null>(null);
  abierto.current = equipo?.id ?? null;

  const sondear = async (id: string): Promise<void> => {
    setSondeando(true);
    setError(undefined);
    try {
      const resultado = desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/diagnostico', {
          params: { path: { id: copropiedadId, equipoId: id } },
        }),
      );
      if (abierto.current !== id) return;
      setSondeo(resultado);
      // La verificación y las capacidades acaban de cambiar en el inventario.
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
      // C1 (15-L) · la tabla de Dispositivos sale del tablero: también se refresca.
      await clientes.invalidateQueries({ queryKey: ['tablero', copropiedadId, 'dispositivos'] });
    } catch (e) {
      if (abierto.current !== id) return;
      setSondeo(null);
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo sondear el equipo');
    } finally {
      if (abierto.current === id) setSondeando(false);
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

      {/* E5 · 10 (15-M) · si el sondeo de hoy no leyó modelo y firmware, los guardados
          se enseñan con la fecha en que se leyeron: nunca como si fueran de ahora. */}
      {sondeo !== null && sondeo.identidadDel !== undefined && sondeo.identidadDel !== null ? (
        <p className="text-secundario text-aviso-texto">
          {sondeo.modelo ?? 'Modelo sin declarar'}
          {sondeo.firmware === null ? '' : ` · ${sondeo.firmware}`} · dato del{' '}
          {fechaCorta(sondeo.identidadDel)} (el sondeo de hoy no alcanzó el equipo)
        </p>
      ) : null}

      {aviso !== null ? (
        <p
          role="status"
          className="rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto"
        >
          {aviso}
        </p>
      ) : null}

      {equipo !== null && CON_VIDEO.has(equipo.tipo) ? (
        conVideo ? (
          <VideoEnVivo copropiedadId={copropiedadId} dispositivoId={equipo.id} />
        ) : (
          <Boton type="button" variante="secundario" tamano="sm" onClick={() => setConVideo(true)}>
            Ver video en vivo
          </Boton>
        )
      ) : null}

      {/* 15-P · P3 · las salidas que declara el videoportero, y su nombre para la guardia. */}
      {equipo !== null && equipo.tipo === 'intercom' && equipo.estado === 'activo' ? (
        <SalidasDelVideoportero copropiedadId={copropiedadId} equipoId={equipo.id} />
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
          {equipo === null ? null : (
            <AccionesDeSitio
              copropiedadId={copropiedadId}
              equipo={equipo}
              motivo={puedeCorregir ? motivo.trim() : null}
              alTerminar={(texto) => {
                setError(undefined);
                setAviso(texto);
                // La ficha enseña lo que el equipo dice AHORA.
                void sondear(equipo.id);
              }}
              alFallar={(mensaje) => setError(mensaje)}
            />
          )}
        </>
      )}
    </DialogoDeFormulario>
  );
};
