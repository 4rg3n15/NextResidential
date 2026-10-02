'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DispositivoDelTablero, Equipo } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useDispositivos, useDispositivosPendientes, useEquipos } from '@/lib/api/consultas';
import { AltaDeEquipo } from './alta-de-equipo';
import { FichaDialogo } from './ficha-dialogo';
import { DialogoDeAtestacion, distintivoDeAtestacion } from './atestacion-dialogo';
import { fechaCorta } from './ficha-dialogo';
import { DialogoDeBajaDeEquipo, EquiposDadosDeBaja } from './baja-de-equipo';
import { EdgeDelConjunto } from './edge-del-conjunto';

/**
 * O4 · lo que el equipo DECLARA, en una frase por tipo. Sale de las capacidades
 * descubiertas al sondear (neutrales: ninguna marca aquí). `desconocida` se
 * dice, no se pinta en verde.
 */
export const resumenDeCapacidades = (e: Equipo): { tono: TonoDeDistintivo; texto: string }[] => {
  const c = e.capacidades;
  if (c === null) return [{ tono: 'neutro', texto: 'Sin sondear' }];
  const si = (estado: string): TonoDeDistintivo =>
    estado === 'si' ? 'exito' : estado === 'no' ? 'peligro' : 'neutro';
  const palabra = (estado: string, siTexto: string, noTexto: string, dudaTexto: string): string =>
    estado === 'si' ? siTexto : estado === 'no' ? noTexto : dudaTexto;
  // D2 (15-L) · el video, como lo describió el equipo por RTSP al probarlo.
  const video = (): { tono: TonoDeDistintivo; texto: string } => {
    const v = c.video;
    const canal = v.canal === null ? '' : ` (${v.canal})`;
    if (v.codec === 'H.264') return { tono: 'exito', texto: `Video H.264${canal}` };
    if (v.codec !== null) {
      return { tono: 'peligro', texto: `Video ${v.codec}${canal}: no se ve en el navegador` };
    }
    return v.estado === 'no'
      ? { tono: 'aviso', texto: `Sin video en el canal${canal}` }
      : { tono: 'neutro', texto: 'Video sin comprobar' };
  };
  const conVideo = (lista: { tono: TonoDeDistintivo; texto: string }[]) => [...lista, video()];
  switch (e.tipo) {
    case 'terminal_facial':
      return conVideo([
        {
          tono: si(c.verificacionRemota),
          texto: palabra(
            c.verificacionRemota,
            'Reporta y espera',
            'Decide sola',
            'Verificación sin comprobar',
          ),
        },
        {
          tono: si(c.bibliotecaDeRostros.estado),
          texto:
            c.bibliotecaDeRostros.estado === 'si' && c.bibliotecaDeRostros.maximo !== null
              ? `${String(c.bibliotecaDeRostros.almacenadas ?? 0)}/${String(c.bibliotecaDeRostros.maximo)} plantillas`
              : palabra(
                  c.bibliotecaDeRostros.estado,
                  'Biblioteca',
                  'Sin biblioteca',
                  'Biblioteca sin comprobar',
                ),
        },
      ]);
    case 'intercom':
      return conVideo([
        {
          tono: si(c.aperturaRemota),
          texto: palabra(
            c.aperturaRemota,
            'Abre desde la central',
            'No abre desde aquí',
            'Apertura sin comprobar',
          ),
        },
        {
          tono:
            c.audioBidireccional.estado === 'si'
              ? 'exito'
              : c.audioBidireccional.estado === 'no'
                ? 'aviso'
                : 'neutro',
          texto:
            c.audioBidireccional.estado === 'si'
              ? `Audio canal ${String(c.audioBidireccional.canal ?? '?')}`
              : palabra(c.audioBidireccional.estado, 'Audio', 'Sin audio', 'Audio sin comprobar'),
        },
        {
          // H-SITIO-09 · si recibe plantillas, y si no, que NO los admite: no
          // es lo mismo que «sin comprobar», que se resuelve sondeando. A3
          // (15-L) · con las palabras del encargo, las mismas que la
          // sincronización deja en su resultado.
          tono: c.bibliotecaDeRostros.estado === 'si' ? 'exito' : 'neutro',
          texto: palabra(
            c.bibliotecaDeRostros.estado,
            'Rostros: recibe plantillas',
            'Este equipo no admite rostros',
            'Rostros sin comprobar',
          ),
        },
      ]);
    case 'camara_lpr':
      return conVideo([
        {
          tono: si(c.reconocimientoDePlacas),
          texto: palabra(
            c.reconocimientoDePlacas,
            'Lee placas',
            'No lee placas',
            'Placas sin comprobar',
          ),
        },
      ]);
    default:
      return [
        {
          tono: si(c.aperturaRemota),
          texto: palabra(
            c.aperturaRemota,
            'Abre desde la plataforma',
            'No abre desde aquí',
            'Apertura sin comprobar',
          ),
        },
      ];
  }
};

const VERIFICACION: Readonly<
  Record<Equipo['verificacion'], { tono: TonoDeDistintivo; texto: string }>
> = {
  verificado: { tono: 'exito', texto: 'Verificado' },
  no_verificado: { tono: 'neutro', texto: 'No verificado' },
  rechazado: { tono: 'peligro', texto: 'Decide solo' },
};

type Operacion = 'configuracion' | 'sincronizacion' | 'reinicio';

/**
 * E5 (15-M) · el estado sale de `estadoDelEquipo`, la MISMA función que la
 * ficha y la lista de equipos: en sitio, la lista decía «Fuera de línea» de
 * un videoportero que entregaba eventos. «Sin comprobar» es un estado propio:
 * nadie lo miró, y eso no es «caído».
 */
const ESTADO: Readonly<
  Record<
    DispositivoDelTablero['estadoDelEquipo']['enLinea'],
    { tono: TonoDeDistintivo; texto: string }
  >
> = {
  en_linea: { tono: 'exito', texto: 'En línea' },
  degradado: { tono: 'aviso', texto: 'Degradado' },
  fuera_de_linea: { tono: 'peligro', texto: 'Fuera de línea' },
  sin_comprobar: { tono: 'neutro', texto: 'Sin comprobar' },
};

/**
 * El resultado de la última sincronización, con su palabra.
 *
 * **El color nunca es el único portador de significado** (la misma regla que
 * `Distintivo` ya impone): quien no distingue el rojo del verde lee el texto.
 */
const RESULTADO: Readonly<
  Record<
    'pendiente' | 'sincronizada' | 'fallida' | 'suprimida',
    { tono: TonoDeDistintivo; texto: string }
  >
> = {
  sincronizada: { tono: 'exito', texto: 'Correcta' },
  fallida: { tono: 'peligro', texto: 'Falló' },
  pendiente: { tono: 'aviso', texto: 'En cola' },
  suprimida: { tono: 'neutro', texto: 'Suprimida' },
};

/**
 * Dispositivos y sincronización.
 *
 * **Lo que esta pantalla NO muestra nunca: la credencial del equipo.** Ni
 * completa, ni enmascarada, ni la referencia a la bóveda (RN-21). No hace falta
 * filtrarla: **la API no la devuelve**, y el tipo generado desde el contrato ni
 * siquiera tiene ese campo, así que un descuido aquí no compilaría. Es la
 * diferencia entre ocultar un dato y no tenerlo.
 *
 * **«Sincronizando» es un estado real, no una animación.** Sale de la lista de
 * órdenes encoladas que la API mantiene: cuando alguien pulsa sincronizar, el
 * equipo aparece así hasta que la orden se ejecute. La ejecución contra el
 * hardware llega con la ETAPA 15, y el aviso lo dice en vez de fingir que el
 * equipo ya respondió.
 */
export const PantallaDeDispositivos = ({
  copropiedadId,
  puedeAtestar = false,
}: {
  readonly copropiedadId: string;
  /** D-11 · sólo el superadministrador atesta; la API lo impone igual. */
  readonly puedeAtestar?: boolean;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [atestando, setAtestando] = useState<Equipo | null>(null);
  const consulta = useDispositivos(copropiedadId);
  const pendientes = useDispositivosPendientes(copropiedadId);
  const inventario = useEquipos(copropiedadId);
  const [editando, setEditando] = useState<Equipo | null>(null);
  const [fichaDe, setFichaDe] = useState<Equipo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [dandoDeAlta, setDandoDeAlta] = useState(false);
  // C4 (15-M) · la baja con motivo y la vista de los dados de baja (RN-19).
  const [bajaDe, setBajaDe] = useState<Equipo | null>(null);
  const [ver, setVer] = useState<'activos' | 'baja'>('activos');

  /**
   * Las tres rutas se escriben ENTERAS y no se componen con una plantilla. El
   * cliente está tipado desde el contrato: una ruta armada con interpolación no
   * existiría para TypeScript y habría que forzarla con un `as`, que es
   * exactamente el atajo por el que una ruta mal escrita llega a producción.
   */
  const ordenar = async (id: string, operacion: Operacion): Promise<void> => {
    setEnCurso(`${id}:${operacion}`);
    setError(null);
    const parametros = { params: { path: { id: copropiedadId, dispositivoId: id } } } as const;
    try {
      const r = desenvolver(
        operacion === 'configuracion'
          ? await cliente.POST(
              '/copropiedades/{id}/dispositivos/{dispositivoId}/configuracion',
              parametros,
            )
          : operacion === 'sincronizacion'
            ? await cliente.POST(
                '/copropiedades/{id}/dispositivos/{dispositivoId}/sincronizacion',
                parametros,
              )
            : await cliente.POST(
                '/copropiedades/{id}/dispositivos/{dispositivoId}/reinicio',
                parametros,
              ),
      );
      setAviso(r.detalle);
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
      // C1 (15-L) · la tabla de Dispositivos sale del tablero: también se refresca.
      await clientes.invalidateQueries({ queryKey: ['tablero', copropiedadId, 'dispositivos'] });
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo enviar la orden');
    } finally {
      setEnCurso(null);
    }
  };

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  const sincronizando = new Set(pendientes.data?.dispositivos ?? []);
  /**
   * H-SITIO-02 · si la orden NO llega al equipo, el botón lo dice. En sitio,
   * con el proveedor real, «Reiniciar» sólo anotaba la intención y se leía
   * como si reiniciara. Mientras la API no conteste, se asume lo prudente.
   */
  const soloRegistra = pendientes.data?.ejecutaContraElEquipo !== true;
  const detalleDeEjecucion = pendientes.data?.detalleDeEjecucion;
  // El tablero dice si está en línea; el inventario dice qué es y qué declara.
  const porId = new Map((inventario.data?.equipos ?? []).map((e) => [e.id, e] as const));

  const columnas: readonly Columna<DispositivoDelTablero>[] = [
    {
      clave: 'equipo',
      titulo: 'Equipo',
      texto: (d) => `${d.nombre} ${d.tipo}`,
      celda: (d) => (
        <div>
          <p className="font-medium text-texto">{d.nombre}</p>
          <p className="text-secundario text-texto-apagado">{d.tipo.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      // Sin dirección ni puerto (15-D, §7.1): con el equipo habla el servidor, no este navegador.
      clave: 'modelo',
      titulo: 'Modelo · firmware',
      texto: (d) => `${d.modelo ?? ''} ${d.firmware ?? ''}`,
      celda: (d) => {
        // E5 · 10 (15-M) · fuera de línea, modelo y firmware son de otro día: se dice cuál.
        const leidoEl = porId.get(d.id)?.identidadLeidaEn ?? null;
        const viejo = d.estadoDelEquipo.enLinea !== 'en_linea' && leidoEl !== null;
        return (
          <p className="text-secundario text-texto-apagado">
            {d.modelo ?? 'Modelo sin registrar'} · {d.firmware ?? 'firmware desconocido'}
            {viejo ? ` · dato del ${fechaCorta(leidoEl)}` : ''}
          </p>
        );
      },
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      texto: (d) => `${ESTADO[d.estadoDelEquipo.enLinea].texto} ${d.estadoDelEquipo.motivo}`,
      celda: (d) =>
        sincronizando.has(d.id) ? (
          <Distintivo tono="marca">Sincronizando</Distintivo>
        ) : (
          <div className="flex flex-col gap-1">
            <Distintivo tono={ESTADO[d.estadoDelEquipo.enLinea].tono}>
              {ESTADO[d.estadoDelEquipo.enLinea].texto}
            </Distintivo>
            <span className="text-secundario text-texto-apagado" title={d.estadoDelEquipo.motivo}>
              {d.estadoDelEquipo.motivo}
            </span>
          </div>
        ),
    },
    {
      clave: 'declara',
      titulo: 'Lo que declara',
      texto: (d) => {
        const e = porId.get(d.id);
        return e === undefined
          ? ''
          : resumenDeCapacidades(e)
              .map((x) => x.texto)
              .join(' ');
      },
      celda: (d) => {
        const e = porId.get(d.id);
        if (e === undefined) return <span className="text-secundario text-texto-apagado">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            <Distintivo tono={VERIFICACION[e.verificacion].tono}>
              {VERIFICACION[e.verificacion].texto}
            </Distintivo>
            {(() => {
              // D-11 · ámbar si se opera por atestación; rojo si quedó sin efecto.
              const atestacion = distintivoDeAtestacion(e);
              return atestacion === null ? null : (
                <Distintivo tono={atestacion.tono}>{atestacion.texto}</Distintivo>
              );
            })()}
            {resumenDeCapacidades(e).map((x) => (
              <Distintivo key={x.texto} tono={x.tono}>
                {x.texto}
              </Distintivo>
            ))}
          </div>
        );
      },
    },
    {
      clave: 'sincronizacion',
      titulo: 'Última sincronización',
      /**
       * ═══════════════════════════════════════════════════════════════════
       * ETAPA 15 · LA FECHA SOLA NO DECÍA NADA
       *
       * Hasta hoy esta columna era sólo el instante. Una sincronización
       * FALLIDA hace un minuto se leía igual que una correcta, y ése es
       * justo el caso en el que hay que actuar: una plantilla que no llegó a
       * la terminal es una persona que no va a poder entrar, y nadie se
       * entera hasta que está delante de la puerta.
       *
       * «Nunca» y «falló» no se colapsan: un equipo recién instalado que no
       * ha sincronizado nada no tiene ningún problema que resolver.
       */
      celda: (d) => (
        <div className="flex flex-col gap-1">
          <span className="text-secundario text-texto-apagado">
            {d.ultimaSincronizacion === null
              ? 'Nunca'
              : new Date(d.ultimaSincronizacion).toLocaleString('es-CO', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
          </span>
          {d.ultimoResultadoDeSincronizacion !== null ? (
            <Distintivo tono={RESULTADO[d.ultimoResultadoDeSincronizacion].tono}>
              {RESULTADO[d.ultimoResultadoDeSincronizacion].texto}
            </Distintivo>
          ) : null}
          {d.sincronizacionesFallidas > 1 ? (
            <span className="text-secundario text-peligro-texto">
              {d.sincronizacionesFallidas} plantillas sin llegar
            </span>
          ) : null}
        </div>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (d) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {porId.has(d.id) ? (
            <>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={enCurso !== null}
                onClick={() => setFichaDe(porId.get(d.id) ?? null)}
              >
                {/* C3 (15-L) · la ficha SONDEA el equipo: capacidad por capacidad. */}
                Probar conexión
              </Boton>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={enCurso !== null}
                onClick={() => setEditando(porId.get(d.id) ?? null)}
              >
                Editar
              </Boton>
              <Boton
                variante="peligro"
                tamano="sm"
                disabled={enCurso !== null}
                onClick={() => setBajaDe(porId.get(d.id) ?? null)}
              >
                Dar de baja
              </Boton>
              {puedeAtestar && porId.get(d.id)?.tipo === 'camara_lpr' ? (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  disabled={enCurso !== null}
                  onClick={() => setAtestando(porId.get(d.id) ?? null)}
                >
                  Atestar
                </Boton>
              ) : null}
            </>
          ) : null}
          {/* E5 · 10 (15-M) · si la orden NO llega al equipo, el botón no se enseña:
              en sitio «Reiniciar · sólo registra» se leía como si reiniciara. */}
          {soloRegistra
            ? null
            : (['configuracion', 'sincronizacion', 'reinicio'] as const).map((op) => (
                <Boton
                  key={op}
                  variante={op === 'reinicio' ? 'peligro' : 'secundario'}
                  tamano="sm"
                  cargando={enCurso === `${d.id}:${op}`}
                  disabled={enCurso !== null}
                  onClick={() => void ordenar(d.id, op)}
                  title={detalleDeEjecucion}
                >
                  {op === 'configuracion'
                    ? 'Configurar'
                    : op === 'sincronizacion'
                      ? 'Sincronizar'
                      : 'Reiniciar'}
                </Boton>
              ))}
        </div>
      ),
    },
  ];

  const equipos = consulta.data?.dispositivos ?? [];
  const enLinea = equipos.filter((d) => d.estadoDelEquipo.enLinea === 'en_linea').length;
  const sinComprobar = equipos.filter((d) => d.estadoDelEquipo.enLinea === 'sin_comprobar').length;
  const dadosDeBaja = (inventario.data?.equipos ?? []).filter((e) => e.estado === 'inactivo');

  /**
   * A.4 · «Sincronizar todo» encola la orden en CADA equipo, una por una y por
   * la misma ruta que el botón de la fila. No hay un endpoint «todos» a
   * propósito: el rastro de auditoría tiene que decir qué equipo se sincronizó
   * y quién lo pidió, y un lote colapsaría eso en una sola línea.
   */
  const sincronizarTodo = async (): Promise<void> => {
    for (const d of equipos) await ordenar(d.id, 'sincronizacion');
    setAviso(`Se encoló la sincronización de ${String(equipos.length)} equipo(s)`);
  };

  return (
    <>
      <EncabezadoDePantalla
        titulo="Dispositivos"
        descripcion="Inventario y estado de los equipos. Sus contraseñas nunca se muestran: no salen del servidor."
        resumen={
          consulta.data === undefined ? null : (
            <>
              <Distintivo tono="exito">{enLinea} en línea</Distintivo>
              <Distintivo tono="peligro">
                {equipos.filter((d) => d.estadoDelEquipo.enLinea === 'fuera_de_linea').length} fuera
                de línea
              </Distintivo>
              {sinComprobar > 0 ? (
                <Distintivo tono="neutro">{sinComprobar} sin comprobar</Distintivo>
              ) : null}
              {sincronizando.size > 0 ? (
                <Distintivo tono="marca">{sincronizando.size} sincronizando</Distintivo>
              ) : null}
            </>
          )
        }
        acciones={
          <div className="flex gap-2">
            {soloRegistra ? null : (
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={enCurso !== null || equipos.length === 0}
                onClick={() => void sincronizarTodo()}
                title={detalleDeEjecucion}
              >
                Sincronizar todo
              </Boton>
            )}
            <Boton tamano="sm" onClick={() => setDandoDeAlta(true)}>
              + Agregar equipo
            </Boton>
          </div>
        }
      />

      <EdgeDelConjunto copropiedadId={copropiedadId} esSuperadmin={puedeAtestar} />
      <AltaDeEquipo
        copropiedadId={copropiedadId}
        abierto={dandoDeAlta}
        alCerrar={() => setDandoDeAlta(false)}
      />
      <AltaDeEquipo
        copropiedadId={copropiedadId}
        abierto={editando !== null}
        equipo={editando}
        alCerrar={() => setEditando(null)}
      />
      <FichaDialogo
        copropiedadId={copropiedadId}
        equipo={fichaDe}
        alCerrar={() => setFichaDe(null)}
      />
      <DialogoDeBajaDeEquipo
        copropiedadId={copropiedadId}
        equipo={bajaDe}
        alCerrar={() => setBajaDe(null)}
        alDarDeBaja={setAviso}
      />
      {puedeAtestar ? (
        <DialogoDeAtestacion
          copropiedadId={copropiedadId}
          equipo={atestando}
          alCerrar={() => setAtestando(null)}
          alAtestar={setAviso}
        />
      ) : null}

      {soloRegistra ? (
        <p className="mb-3 rounded-md border border-aviso bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto">
          Configurar, sincronizar y reiniciar no llegan al equipo con este proveedor: los botones no
          se muestran para no parecer que actúan.
          {detalleDeEjecucion === undefined ? '' : ` ${detalleDeEjecucion}`}
        </p>
      ) : null}
      {aviso !== null ? (
        <p
          role="status"
          className="mb-3 rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado"
        >
          {aviso}
        </p>
      ) : null}
      {error !== null ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
        >
          {error}
        </p>
      ) : null}

      <div role="group" aria-label="Qué equipos ver" className="mb-3 flex gap-2">
        <Boton
          variante={ver === 'activos' ? 'primario' : 'secundario'}
          tamano="sm"
          aria-pressed={ver === 'activos'}
          onClick={() => setVer('activos')}
        >
          Activos ({equipos.length})
        </Boton>
        <Boton
          variante={ver === 'baja' ? 'primario' : 'secundario'}
          tamano="sm"
          aria-pressed={ver === 'baja'}
          onClick={() => setVer('baja')}
        >
          Dados de baja ({dadosDeBaja.length})
        </Boton>
      </div>

      {ver === 'baja' ? (
        <EquiposDadosDeBaja
          copropiedadId={copropiedadId}
          equipos={dadosDeBaja}
          cargando={inventario.isLoading}
          alAvisar={setAviso}
        />
      ) : (
        <TablaDeDatos
          titulo="Equipos de la copropiedad"
          columnas={columnas}
          filas={equipos}
          claveDeFila={(d) => d.id}
          cargando={consulta.isLoading}
          buscador={{ marcador: 'Buscar por nombre, tipo o modelo' }}
          vacio={{
            titulo: 'Sin dispositivos',
            descripcion:
              'No hay equipos registrados en esta copropiedad. Use «Agregar equipo» con la dirección, el usuario y la clave del aparato.',
          }}
        />
      )}
    </>
  );
};
