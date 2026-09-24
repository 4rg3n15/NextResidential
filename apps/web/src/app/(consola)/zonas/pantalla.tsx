'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import type { Zona } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { cn } from '@/lib/cn';
import { claseDeAncho } from '@/lib/proporcion';
import { useZonas } from '@/lib/api/consultas';
import { minutosDeHora } from '@/lib/validacion/vigencia';
import { franjaEnTexto } from './horario';
import { OPCIONES_DE_ICONO, iconoDeZona } from './iconos';

const TIPOS_DE_ZONA = [
  { valor: 'comun', etiqueta: 'Zona común' },
  { valor: 'peatonal', etiqueta: 'Acceso peatonal' },
  { valor: 'vehicular', etiqueta: 'Acceso vehicular' },
] as const;
type TipoDeZona = (typeof TIPOS_DE_ZONA)[number]['valor'];

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/** Una franja tal como se edita: horas de reloj, que es como se piensan. */
interface FranjaEditable {
  readonly dia: number;
  readonly inicio: string;
  readonly fin: string;
}

const horaDeMinutos = (minutos: number): string => {
  const acotado = Math.min(1440, Math.max(0, minutos));
  const h = Math.floor(acotado / 60);
  const m = acotado % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Lo que el formulario de una zona tiene entre manos. */
interface FormularioDeZona {
  nombre: string;
  tipo: TipoDeZona;
  aforoMaximo: string;
  icono: string;
  normas: string;
  abierta: boolean;
  franjas: readonly FranjaEditable[];
}

const FORMULARIO_VACIO: FormularioDeZona = {
  nombre: '',
  tipo: 'comun',
  aforoMaximo: '0',
  icono: '',
  normas: '',
  abierta: true,
  franjas: [],
};

const formularioDe = (z: Zona): FormularioDeZona => ({
  nombre: z.nombre,
  tipo: TIPOS_DE_ZONA.some((t) => t.valor === z.tipo) ? (z.tipo as TipoDeZona) : 'comun',
  aforoMaximo: String(z.aforoMaximo),
  icono: z.icono ?? '',
  normas: z.normas.join('\n'),
  abierta: z.abierta,
  franjas: z.horario.map((f) => ({
    dia: f.dia,
    inicio: horaDeMinutos(f.minutoInicio),
    fin: horaDeMinutos(f.minutoFin),
  })),
});

/** Primera franja inválida, en palabras; `null` si todas están bien. */
const problemaDeFranjas = (franjas: readonly FranjaEditable[]): string | null => {
  for (const f of franjas) {
    const inicio = minutosDeHora(f.inicio);
    const fin = minutosDeHora(f.fin);
    if (inicio === null || fin === null) return 'Cada franja necesita hora de inicio y de fin.';
    if (fin <= inicio) return `La franja del ${DIAS[f.dia] ?? ''} termina antes de empezar.`;
  }
  return null;
};

/**
 * Zonas comunes.
 *
 * **La interfaz REFLEJA; no calcula.** El aforo lo garantiza la base —una
 * restricción, no un `if`— y el «dentro de horario» lo resuelve el objeto de
 * valor con el reloj inyectado. Si esta pantalla restara ingresos de salidas
 * para pintar la barra, tendría una segunda verdad que se separaría de la
 * primera en la primera carrera: dos personas entrando a la vez.
 *
 * Por eso se refresca cada quince segundos en vez de recalcular: preguntar es
 * más lento que sumar, y es lo único que no puede mentir.
 */
export const PantallaDeZonas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consulta = useZonas(copropiedadId);
  const clientes = useQueryClient();

  /**
   * O3 · alta, edición y baja desde la consola. Los tres piden a la API; ésta
   * decide (aforo no negativo, nombre único, icono con forma). Aquí sólo se
   * arma el cuerpo y se muestra tal cual lo que la API conteste.
   */
  const [alta, setAlta] = useState(false);
  const [editar, setEditar] = useState<Zona | null>(null);
  const [baja, setBaja] = useState<Zona | null>(null);
  const [formulario, setFormulario] = useState<FormularioDeZona>(FORMULARIO_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiar = <K extends keyof FormularioDeZona>(clave: K, valor: FormularioDeZona[K]): void =>
    setFormulario((f) => ({ ...f, [clave]: valor }));

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['zonas', copropiedadId] });
  };

  const abrirAlta = (): void => {
    setFormulario(FORMULARIO_VACIO);
    setError(undefined);
    setAlta(true);
  };
  const abrirEdicion = (z: Zona): void => {
    setFormulario(formularioDe(z));
    setError(undefined);
    setEditar(z);
  };

  const normasDe = (texto: string): string[] =>
    texto
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n !== '');

  const problemaFranjas = problemaDeFranjas(formulario.franjas);
  const aforo = Number(formulario.aforoMaximo);
  const puedeEnviar =
    formulario.nombre.trim() !== '' &&
    Number.isInteger(aforo) &&
    aforo >= 0 &&
    problemaFranjas === null;

  const crear = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const creada = desenvolver(
        await cliente.POST('/copropiedades/{id}/zonas', {
          params: { path: { id: copropiedadId } },
          body: {
            nombre: formulario.nombre.trim(),
            tipo: formulario.tipo,
            aforoMaximo: aforo,
            ...(formulario.icono === '' ? {} : { icono: formulario.icono }),
            ...(normasDe(formulario.normas).length === 0
              ? {}
              : { normas: normasDe(formulario.normas) }),
          },
        }),
      );
      // El horario se configura en un segundo paso sobre la zona ya creada:
      // es la misma ruta que usa la edición, y así hay UNA forma de guardarlo.
      if (formulario.franjas.length > 0) {
        desenvolver(
          await cliente.POST('/copropiedades/{id}/zonas/{zonaId}/configuracion', {
            params: { path: { id: copropiedadId, zonaId: creada.id } },
            body: { horario: franjasParaLaApi(formulario.franjas) },
          }),
        );
      }
      setAlta(false);
      setAviso(`Zona «${formulario.nombre.trim()}» creada.`);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo crear la zona');
    } finally {
      setEnviando(false);
    }
  };

  const guardar = async (): Promise<void> => {
    if (editar === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/zonas/{zonaId}/configuracion', {
          params: { path: { id: copropiedadId, zonaId: editar.id } },
          body: {
            nombre: formulario.nombre.trim(),
            aforoMaximo: aforo,
            icono: formulario.icono === '' ? null : formulario.icono,
            normas: normasDe(formulario.normas),
            abierta: formulario.abierta,
            horario: franjasParaLaApi(formulario.franjas),
          },
        }),
      );
      setEditar(null);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo guardar la zona');
    } finally {
      setEnviando(false);
    }
  };

  const darDeBaja = async (motivo: string): Promise<void> => {
    if (baja === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/zonas/{zonaId}/baja', {
          params: { path: { id: copropiedadId, zonaId: baja.id } },
          body: { motivo },
        }),
      );
      setAviso(`Zona «${baja.nombre}» dada de baja. Su historial se conserva.`);
      setBaja(null);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo dar de baja la zona');
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

  const zonas = consulta.data ?? [];

  return (
    <>
      <EncabezadoDePantalla
        titulo="Zonas comunes"
        descripcion="Ocupación en tiempo real frente al aforo máximo. El aforo lo garantiza la base de datos; esta pantalla lo muestra."
        resumen={
          consulta.data === undefined ? null : (
            <Distintivo tono="neutro">{zonas.length} zonas configuradas</Distintivo>
          )
        }
        acciones={<Boton onClick={abrirAlta}>Nueva zona</Boton>}
      />

      {aviso !== null ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-exito bg-exito-suave px-3 py-2 text-secundario text-exito-texto"
        >
          {aviso}
        </p>
      ) : null}

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando zonas" /> : null}

      {consulta.data !== undefined && zonas.length === 0 ? (
        <EstadoVacio
          titulo="Sin zonas comunes"
          descripcion="Esta copropiedad no tiene zonas configuradas todavía."
          accion={<Boton onClick={abrirAlta}>Nueva zona</Boton>}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zonas.map((z) => (
          <TarjetaDeZona key={z.id} zona={z} alEditar={abrirEdicion} alDarDeBaja={setBaja} />
        ))}
      </div>

      <DialogoDeFormulario
        abierto={alta || editar !== null}
        titulo={editar === null ? 'Nueva zona' : `Editar ${editar.nombre}`}
        descripcion={
          editar === null
            ? 'Nombre, tipo, aforo e icono. El horario y las normas se pueden dejar para después.'
            : 'El aforo lo garantiza la base; el horario lo aplica el motor de reglas (RN-14, CA-15).'
        }
        etiquetaEnviar={editar === null ? 'Crear zona' : 'Guardar cambios'}
        enviando={enviando}
        error={error}
        puedeEnviar={puedeEnviar}
        alEnviar={() => void (editar === null ? crear() : guardar())}
        alCancelar={() => {
          setAlta(false);
          setEditar(null);
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Nombre"
          value={formulario.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          maxLength={100}
          required
        />
        {editar === null ? (
          <label className="block space-y-1.5">
            <span className="block text-secundario font-medium">Tipo</span>
            <select
              value={formulario.tipo}
              onChange={(e) => cambiar('tipo', e.target.value as TipoDeZona)}
              className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              {TIPOS_DE_ZONA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Campo
          etiqueta="Aforo máximo"
          type="number"
          min={0}
          max={100000}
          value={formulario.aforoMaximo}
          onChange={(e) => cambiar('aforoMaximo', e.target.value)}
          ayuda="Personas a la vez. 0 = sin límite práctico. Lo garantiza la base de datos (RN-14)."
          required
        />
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Icono de la tarjeta</span>
          <select
            value={formulario.icono}
            onChange={(e) => cambiar('icono', e.target.value)}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            <option value="">Sin icono</option>
            {OPCIONES_DE_ICONO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Normas y restricciones</span>
          <textarea
            value={formulario.normas}
            onChange={(e) => cambiar('normas', e.target.value)}
            rows={3}
            placeholder="Una por línea"
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          />
        </label>
        {editar !== null ? (
          <label className="flex items-center gap-2 text-secundario text-texto">
            <input
              type="checkbox"
              checked={formulario.abierta}
              onChange={(e) => cambiar('abierta', e.target.checked)}
              className="h-4 w-4 accent-marca"
            />
            Abierta (desmárquela para un cierre manual sin tocar el horario)
          </label>
        ) : null}

        <fieldset className="space-y-2 rounded-campo border border-borde p-3">
          <legend className="px-1 text-secundario font-medium text-texto">Horario semanal</legend>
          {formulario.franjas.length === 0 ? (
            <p className="text-secundario text-texto-apagado">
              Sin franjas: abierta según la política de la zona.
            </p>
          ) : null}
          {formulario.franjas.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-distintivo text-texto-apagado">Día</span>
                <select
                  value={f.dia}
                  onChange={(e) =>
                    cambiar(
                      'franjas',
                      formulario.franjas.map((x, j) =>
                        j === i ? { ...x, dia: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
                >
                  {DIAS.map((d, indice) => (
                    <option key={d} value={indice}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <Campo
                etiqueta="Desde"
                type="time"
                value={f.inicio}
                onChange={(e) =>
                  cambiar(
                    'franjas',
                    formulario.franjas.map((x, j) =>
                      j === i ? { ...x, inicio: e.target.value } : x,
                    ),
                  )
                }
              />
              <Campo
                etiqueta="Hasta"
                type="time"
                value={f.fin}
                onChange={(e) =>
                  cambiar(
                    'franjas',
                    formulario.franjas.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)),
                  )
                }
              />
              <Boton
                variante="fantasma"
                tamano="sm"
                aria-label={`Quitar la franja del ${DIAS[f.dia] ?? ''}`}
                onClick={() =>
                  cambiar(
                    'franjas',
                    formulario.franjas.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 aria-hidden className="size-4" />
              </Boton>
            </div>
          ))}
          {problemaFranjas !== null ? (
            <p role="alert" className="text-distintivo text-peligro-texto">
              {problemaFranjas}
            </p>
          ) : null}
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={formulario.franjas.length >= 50}
            onClick={() =>
              cambiar('franjas', [...formulario.franjas, { dia: 1, inicio: '08:00', fin: '18:00' }])
            }
          >
            Añadir franja
          </Boton>
        </fieldset>
      </DialogoDeFormulario>

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={`Dar de baja ${baja?.nombre ?? ''}`}
        descripcion="La zona deja de estar disponible y se conserva su historial de accesos. No se borra."
        etiquetaConfirmar="Dar de baja"
        enviando={enviando}
        error={error}
        sugerencias={['En mantenimiento', 'Cerrada por la administración', 'Creada por error']}
        alConfirmar={(motivo) => void darDeBaja(motivo)}
        alCancelar={() => {
          setBaja(null);
          setError(undefined);
        }}
      />
    </>
  );
};

/** Del formulario al contrato: minutos, no horas; y el día tal cual. */
const franjasParaLaApi = (
  franjas: readonly FranjaEditable[],
): { dia: number; minutoInicio: number; minutoFin: number }[] =>
  franjas.map((f) => ({
    dia: f.dia,
    minutoInicio: minutosDeHora(f.inicio) ?? 0,
    minutoFin: minutosDeHora(f.fin) ?? 0,
  }));

const TarjetaDeZona = ({
  zona,
  alEditar,
  alDarDeBaja,
}: {
  readonly zona: Zona;
  readonly alEditar: (z: Zona) => void;
  readonly alDarDeBaja: (z: Zona) => void;
}): JSX.Element => {
  const Icono = iconoDeZona(zona.icono);
  const porcentaje =
    zona.aforoMaximo === 0
      ? 0
      : Math.min(100, Math.round((zona.aforoActual / zona.aforoMaximo) * 100));
  const tono = zona.aforoCompleto ? 'peligro' : porcentaje >= 80 ? 'aviso' : 'exito';

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo={zona.nombre}
        descripcion={TIPOS_DE_ZONA.find((t) => t.valor === zona.tipo)?.etiqueta ?? zona.tipo}
        accion={
          <span className="flex items-center gap-2">
            <Icono aria-hidden className="size-5 text-texto-apagado" />
            {zona.activa ? (
              <Distintivo tono={zona.dentroDeHorario && zona.abierta ? 'exito' : 'neutro'}>
                {zona.abierta === false
                  ? 'Cerrada'
                  : zona.dentroDeHorario
                    ? 'Abierta'
                    : 'Fuera de horario'}
              </Distintivo>
            ) : (
              <Distintivo tono="neutro">De baja</Distintivo>
            )}
          </span>
        }
      />
      <CuerpoDeTarjeta className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-cuerpo font-medium tabular-nums">
              {zona.aforoActual} / {zona.aforoMaximo}
            </span>
            <span className="text-secundario text-texto-apagado">
              {zona.aforoDisponible} disponible{zona.aforoDisponible === 1 ? '' : 's'}
            </span>
          </div>
          {/* La barra es una imagen del número que ya vino; no lo recalcula. */}
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutro-suave"
            role="img"
            aria-label={`Ocupación ${porcentaje}% de ${zona.aforoMaximo} plazas`}
          >
            <div
              className={cn(
                tono === 'peligro'
                  ? 'h-full bg-peligro'
                  : tono === 'aviso'
                    ? 'h-full bg-aviso'
                    : 'h-full bg-exito',
                claseDeAncho(porcentaje),
              )}
            />
          </div>
        </div>

        <div>
          <p className="text-secundario font-medium text-texto">Horario</p>
          {zona.horario.length === 0 ? (
            <p className="text-secundario text-texto-apagado">
              Sin franjas: abierta según política.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {zona.horario.map((f, i) => (
                <li
                  key={`${f.dia}-${f.minutoInicio}-${i}`}
                  className="text-secundario text-texto-apagado"
                >
                  {franjaEnTexto(f)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {zona.normas.length > 0 ? (
          <div>
            <p className="text-secundario font-medium text-texto">Normas y restricciones</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {zona.normas.map((n) => (
                <li key={n} className="text-secundario text-texto-apagado">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-secundario font-medium text-texto">Reservas de hoy</p>
          {zona.reservasDelDia.length === 0 ? (
            // Estado vacío HONESTO: no hay módulo de reservas todavía (P-15), y
            // se dice. Un «0 reservas» a secas se leería como «hoy nadie
            // reservó», que es una afirmación que este sistema no puede hacer.
            <p className="text-secundario text-texto-apagado">
              El módulo de reservas no está construido todavía: esta lista no refleja reservas
              reales.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {zona.reservasDelDia.map((r) => (
                <li key={r.id} className="text-secundario text-texto-apagado">
                  {r.titular} · {r.personas} personas
                </li>
              ))}
            </ul>
          )}
        </div>

        {zona.activa ? (
          <div className="flex gap-2 pt-1">
            <Boton variante="secundario" tamano="sm" onClick={() => alEditar(zona)}>
              Editar
            </Boton>
            <Boton variante="peligro" tamano="sm" onClick={() => alDarDeBaja(zona)}>
              Dar de baja
            </Boton>
          </div>
        ) : null}
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};
