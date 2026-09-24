'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import type { EstadoAdministrativo, Vivienda } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useConfiguracion, useViviendas } from '@/lib/api/consultas';
import { nombreDeGrupo, nombreDeVivienda, sinConfigurar, vocabularioDe } from '@/lib/vocabulario';
import { CargaDePadron } from './carga-de-padron';
import { AsistenteDeGeneracion } from './asistente-de-generacion';

/** El mismo catálogo cerrado de la base (`estado_administrativo`, migración 0002). */
const ESTADOS_ADMINISTRATIVOS: readonly {
  readonly valor: EstadoAdministrativo;
  readonly etiqueta: string;
}[] = [
  { valor: 'al_dia', etiqueta: 'Al día' },
  { valor: 'en_mora', etiqueta: 'En mora' },
  { valor: 'suspendida', etiqueta: 'Suspendida' },
];

/**
 * Directorio de viviendas.
 *
 * **Agrupado, y desplegable.** Un conjunto de 300 apartamentos en una tabla
 * plana es una lista de 300 números sin contexto. Agrupado por torre, con el
 * recuento en la cabecera y un `+` por grupo, la pantalla dice lo que el
 * administrador necesita saber —cuántas hay en cada torre— y el alta suelta no
 * puede equivocarse de torre, porque la pone el grupo donde se pulsó.
 *
 * **Las palabras vienen de la configuración.** «Casa», «Torre», «Manzana» son
 * `etiqueta_vivienda` y `etiqueta_agrupacion` de la copropiedad; el
 * identificador guardado es solo el número. Cambiar la palabra repinta esta
 * pantalla y no renombra una sola fila (H-3).
 *
 * **Lo que esta pantalla tiene que decir y ninguna tabla dice sola:** una
 * vivienda inactiva **conserva sus autorizaciones vigentes** (RN-13). Sin ese
 * número junto al estado, «inactiva» se lee como «ya no deja entrar a nadie», y
 * es falso.
 *
 * **No hay borrado.** El botón dice «Desactivar» y exige motivo, porque eso es
 * lo que ocurre: baja lógica con historial (RN-19, CA-02).
 */
export const DirectorioDeViviendas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [estado, setEstado] = useState<'' | 'activo' | 'inactivo'>('');
  const [busqueda, setBusqueda] = useState('');
  const [alta, setAlta] = useState<{ readonly agrupacion: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [baja, setBaja] = useState<Vivienda | null>(null);
  const [borrado, setBorrado] = useState<Vivienda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);

  const [identificador, setIdentificador] = useState('');
  const [agrupacion, setAgrupacion] = useState('');
  /** O3 · edición: número, agrupación y estado administrativo. */
  const [editar, setEditar] = useState<Vivienda | null>(null);
  const [estadoAdministrativo, setEstadoAdministrativo] = useState<EstadoAdministrativo>('al_dia');

  const consulta = useViviendas(copropiedadId, { estado, busqueda });
  const configuracion = useConfiguracion(copropiedadId);
  const vocabulario = vocabularioDe(configuracion.data);
  const tipo = configuracion.data?.tipo ?? null;

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['viviendas', copropiedadId] });
  };

  const abrirEdicion = (v: Vivienda): void => {
    setIdentificador(v.identificador);
    setAgrupacion(v.agrupacion ?? '');
    setEstadoAdministrativo(
      ESTADOS_ADMINISTRATIVOS.some((e) => e.valor === v.estadoAdministrativo)
        ? (v.estadoAdministrativo as EstadoAdministrativo)
        : 'al_dia',
    );
    setError(undefined);
    setEditar(v);
  };

  const guardarEdicion = async (): Promise<void> => {
    if (editar === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.PUT('/copropiedades/{id}/padron/viviendas/{viviendaId}', {
          params: { path: { id: copropiedadId, viviendaId: editar.id } },
          body: {
            ...(identificador.trim() === editar.identificador
              ? {}
              : { identificador: identificador.trim() }),
            ...(agrupacion.trim() === (editar.agrupacion ?? '')
              ? {}
              : { agrupacion: agrupacion.trim() === '' ? null : agrupacion.trim() }),
            ...(estadoAdministrativo === editar.estadoAdministrativo
              ? {}
              : { estadoAdministrativo }),
          },
        }),
      );
      setEditar(null);
      await refrescar();
    } catch (e) {
      // «Ya existe ese número en la torre» lo dice la base por el índice
      // (ADR-04) y la API lo traduce; aquí viaja tal cual.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo editar la vivienda');
    } finally {
      setEnviando(false);
    }
  };

  const abrirAlta = (deGrupo: string): void => {
    setIdentificador('');
    setAgrupacion(deGrupo);
    setError(undefined);
    setAlta({ agrupacion: deGrupo });
  };

  const crear = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        /**
         * La copropiedad de destino va en la RUTA, y sale del selector (D-71).
         * Antes se derivaba del token, y el superadministrador —que no
         * pertenece a ninguna— no podía crear nada.
         */
        await cliente.POST('/copropiedades/{id}/padron/viviendas', {
          params: { path: { id: copropiedadId } },
          body: {
            identificador: identificador.trim(),
            ...(agrupacion.trim() === '' ? {} : { agrupacion: agrupacion.trim() }),
          },
        }),
      );
      setAlta(null);
      setIdentificador('');
      await refrescar();
    } catch (e) {
      // El mensaje de la API viaja TAL CUAL: es quien sabe por qué rechazó
      // —identificador ya activo, o la palabra metida dentro del número— y
      // reinterpretarlo aquí produciría un texto que no coincide con lo que
      // ocurrió.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo crear la vivienda');
    } finally {
      setEnviando(false);
    }
  };

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * B.2 · REACTIVAR Y BORRAR DE VERDAD
   *
   * La baja lógica es lo normal y no cambia. Lo que faltaba eran los dos
   * extremos: volver a poner en servicio una vivienda dada de baja, y borrar
   * de verdad la que se creó por error.
   *
   * **La decisión es del SERVIDOR.** Aquí se ofrece el botón y se muestra lo
   * que conteste; si tiene historial, la API responde con el recuento exacto
   * de lo que lo impide y ese texto viaja tal cual. Adivinar aquí produciría
   * un mensaje que no coincide con lo que ocurrió.
   */
  const reactivar = async (v: Vivienda): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/viviendas/{viviendaId}/reactivacion', {
          params: { path: { id: copropiedadId, viviendaId: v.id } },
        }),
      );
      setAviso(
        `${nombreDeVivienda(vocabulario, v.identificador, v.agrupacion)} vuelve a estar en servicio.`,
      );
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo reactivar');
    } finally {
      setEnviando(false);
    }
  };

  const borrarDefinitivamente = async (): Promise<void> => {
    if (borrado === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.DELETE('/copropiedades/{id}/padron/viviendas/{viviendaId}', {
          params: { path: { id: copropiedadId, viviendaId: borrado.id } },
        }),
      );
      setBorrado(null);
      setAviso(`Se borró definitivamente ${r.identificador}. No queda rastro de la vivienda.`);
      await refrescar();
    } catch (e) {
      // El mensaje de la API dice CUÁNTOS residentes, vehículos, autorizaciones
      // y eventos lo impiden. Sustituirlo por «no se puede» mandaría a adivinar.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo borrar');
    } finally {
      setEnviando(false);
    }
  };

  const desactivar = async (motivo: string): Promise<void> => {
    if (baja === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/viviendas/{viviendaId}/desactivacion', {
          params: { path: { id: copropiedadId, viviendaId: baja.id } },
          body: { motivo },
        }),
      );
      setBaja(null);
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo desactivar');
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

  const datos = consulta.data;
  const viviendas = datos?.viviendas ?? [];

  /**
   * Agrupación en el orden en que llegan. **El orden lo decide el servidor**
   * —por agrupación y por número dentro de ella—, no esta pantalla: si la
   * consola reordenara, el 1000 acabaría antes del 101 en cuanto alguien
   * paginara, y el desajuste solo se vería con padrones grandes.
   */
  const grupos: { readonly agrupacion: string | null; readonly viviendas: Vivienda[] }[] = [];
  for (const vivienda of viviendas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo !== undefined && ultimo.agrupacion === vivienda.agrupacion) {
      ultimo.viviendas.push(vivienda);
    } else {
      grupos.push({ agrupacion: vivienda.agrupacion, viviendas: [vivienda] });
    }
  }

  return (
    <>
      <EncabezadoDePantalla
        titulo="Viviendas"
        descripcion="Directorio del padrón. La desactivación conserva el historial: no hay borrado."
        resumen={
          datos === undefined ? null : (
            <>
              <Distintivo tono="exito">{datos.totales.activas} activas</Distintivo>
              <Distintivo tono="neutro">{datos.totales.inactivas} inactivas</Distintivo>
            </>
          )
        }
        acciones={
          <>
            <a
              href={`/api/ncr/copropiedades/${copropiedadId}/padron/exportacion`}
              download="padron.csv"
              className="inline-flex h-11 items-center gap-2 rounded-campo border border-borde bg-campo px-4 text-cuerpo text-texto hover:bg-borde-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              <Download aria-hidden className="size-4" /> Exportar
            </a>
            <CargaDePadron copropiedadId={copropiedadId} alTerminar={() => void refrescar()} />
            {tipo !== null && tipo !== 'otro' ? (
              <Boton variante="secundario" onClick={() => setGenerando(true)}>
                Generar padrón
              </Boton>
            ) : null}
            <Boton onClick={() => abrirAlta('')}>Nueva {vocabulario.vivienda.toLowerCase()}</Boton>
          </>
        }
      />

      {sinConfigurar(configuracion.data) ? (
        <p
          role="status"
          className="rounded-md border border-aviso bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto"
        >
          Esta copropiedad todavía no dice de qué tipo es, así que el sistema no sabe cómo llamar a
          sus viviendas ni puede generarlas. Configúrelo para empezar.
        </p>
      ) : null}

      {aviso !== null ? (
        <p
          role="status"
          className="rounded-md border border-exito bg-exito-suave px-3 py-2 text-secundario text-exito-texto"
        >
          {aviso}
        </p>
      ) : null}

      <section className="space-y-3 rounded-tarjeta border border-borde bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-subtitulo font-medium text-texto">Viviendas de la copropiedad</h2>
          {/* El buscador es del SERVIDOR y no de esta lista, y hay uno solo. La
              API acota a 500 filas: un filtro que solo mirara lo ya descargado
              diría «sin resultados» sobre un padrón que sí tiene la vivienda. */}
          <label className="flex items-center gap-2 text-secundario">
            <span className="text-texto-apagado">Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Número o ${vocabulario.agrupacion.toLowerCase()}`}
              aria-label="Buscar viviendas en el padrón"
              className="w-64 rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            />
          </label>
          <label className="flex items-center gap-2 text-secundario">
            <span className="text-texto-apagado">Estado</span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as '' | 'activo' | 'inactivo')}
              className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              <option value="">Todas</option>
              <option value="activo">Activas</option>
              <option value="inactivo">Inactivas</option>
            </select>
          </label>
        </div>

        {consulta.isLoading ? <EstadoCargando etiqueta="Cargando el padrón" /> : null}

        {!consulta.isLoading && grupos.length === 0 ? (
          <EstadoVacio
            titulo="Sin viviendas"
            descripcion="El padrón de esta copropiedad está vacío. Genéralo, cárgalo desde un archivo o crea la primera a mano."
            accion={<Boton onClick={() => abrirAlta('')}>Nueva vivienda</Boton>}
          />
        ) : null}

        {grupos.map((grupo, indice) => (
          <details
            key={grupo.agrupacion ?? 'sin-agrupacion'}
            // Con un solo grupo, cerrarlo esconde la pantalla entera detrás de
            // un clic que no aporta nada.
            open={grupos.length === 1 || indice === 0}
            className="rounded-md border border-borde"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2 text-cuerpo text-texto">
              <span className="font-medium">{nombreDeGrupo(vocabulario, grupo.agrupacion)}</span>
              <span className="tabular-nums text-texto-apagado">
                {grupo.viviendas.length} {grupo.viviendas.length === 1 ? 'vivienda' : 'viviendas'}
              </span>
            </summary>
            <ul className="divide-y divide-borde border-t border-borde">
              {grupo.viviendas.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-40 font-medium text-texto">
                    {nombreDeVivienda(vocabulario, v.identificador, v.agrupacion)}
                  </span>
                  <span className="tabular-nums text-secundario text-texto-apagado">
                    {v.residentes} residentes · {v.vehiculos} vehículos
                  </span>
                  <Distintivo tono={v.estado === 'activo' ? 'exito' : 'neutro'}>
                    {v.estado === 'activo' ? 'Activa' : 'Inactiva'}
                  </Distintivo>
                  {v.autorizacionesVigentes > 0 ? (
                    <span className="text-secundario text-texto-apagado">
                      {v.autorizacionesVigentes} autorización
                      {v.autorizacionesVigentes === 1 ? '' : 'es'} vigente
                      {v.autorizacionesVigentes === 1 ? '' : 's'}
                      {v.estado === 'inactivo' ? ' — siguen abriendo (RN-13)' : ''}
                    </span>
                  ) : null}
                  <span className="ml-auto">
                    {v.estado === 'activo' ? (
                      <span className="flex items-center gap-2">
                        {v.estadoAdministrativo !== 'al_dia' ? (
                          <Distintivo tono="aviso">
                            {ESTADOS_ADMINISTRATIVOS.find((e) => e.valor === v.estadoAdministrativo)
                              ?.etiqueta ?? v.estadoAdministrativo}
                          </Distintivo>
                        ) : null}
                        <Boton variante="secundario" tamano="sm" onClick={() => abrirEdicion(v)}>
                          Editar
                        </Boton>
                        <Boton variante="secundario" tamano="sm" onClick={() => setBaja(v)}>
                          Desactivar
                        </Boton>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-secundario text-texto-apagado">
                          {v.motivoDesactivacion ?? 'Sin motivo registrado'}
                        </span>
                        <Boton
                          variante="secundario"
                          tamano="sm"
                          disabled={enviando}
                          onClick={() => void reactivar(v)}
                        >
                          Reactivar
                        </Boton>
                        <Boton variante="peligro" tamano="sm" onClick={() => setBorrado(v)}>
                          Borrar
                        </Boton>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-borde px-3 py-2">
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => abrirAlta(grupo.agrupacion ?? '')}
              >
                <Plus aria-hidden className="size-4" />
                Añadir una en {nombreDeGrupo(vocabulario, grupo.agrupacion).toLowerCase()}
              </Boton>
            </div>
          </details>
        ))}
      </section>

      <DialogoDeFormulario
        abierto={alta !== null}
        titulo={`Nueva ${vocabulario.vivienda.toLowerCase()}`}
        descripcion={`Escriba solo el número: la palabra «${vocabulario.vivienda}» la pone el sistema. El identificador debe ser único dentro de su ${vocabulario.agrupacion.toLowerCase()}, y lo garantiza la base de datos.`}
        etiquetaEnviar="Crear vivienda"
        enviando={enviando}
        error={error}
        puedeEnviar={identificador.trim().length > 0}
        alEnviar={() => void crear()}
        alCancelar={() => {
          setAlta(null);
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Número"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          ayuda={`Como está en la puerta: «42», «101». Se mostrará como «${vocabulario.vivienda} ${identificador.trim() === '' ? '42' : identificador.trim()}».`}
          required
        />
        <Campo
          etiqueta={vocabulario.agrupacion}
          value={agrupacion}
          onChange={(e) => setAgrupacion(e.target.value)}
          ayuda={`Déjelo vacío si esta ${vocabulario.vivienda.toLowerCase()} no pertenece a ninguna.`}
        />
      </DialogoDeFormulario>

      <DialogoDeFormulario
        abierto={editar !== null}
        titulo={`Editar ${editar === null ? '' : nombreDeVivienda(vocabulario, editar.identificador, editar.agrupacion)}`}
        descripcion={`Número, ${vocabulario.agrupacion.toLowerCase()} y estado administrativo. El número sigue siendo único dentro de su ${vocabulario.agrupacion.toLowerCase()}: lo garantiza la base de datos.`}
        etiquetaEnviar="Guardar cambios"
        enviando={enviando}
        error={error}
        puedeEnviar={identificador.trim().length > 0}
        alEnviar={() => void guardarEdicion()}
        alCancelar={() => {
          setEditar(null);
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Número"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          required
        />
        <Campo
          etiqueta={vocabulario.agrupacion}
          value={agrupacion}
          onChange={(e) => setAgrupacion(e.target.value)}
          ayuda={`Vacío si esta ${vocabulario.vivienda.toLowerCase()} no pertenece a ninguna.`}
        />
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Estado administrativo</span>
          <select
            value={estadoAdministrativo}
            onChange={(e) => setEstadoAdministrativo(e.target.value as EstadoAdministrativo)}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {ESTADOS_ADMINISTRATIVOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </DialogoDeFormulario>

      {tipo !== null && tipo !== 'otro' ? (
        <AsistenteDeGeneracion
          copropiedadId={copropiedadId}
          tipo={tipo}
          vocabulario={vocabulario}
          abierto={generando}
          alCerrar={() => setGenerando(false)}
          alTerminar={(r) => {
            setGenerando(false);
            setAviso(
              [
                `Se crearon ${String(r.creadas)} viviendas.`,
                r.conservadas > 0 ? `${String(r.conservadas)} ya existían y se conservaron.` : null,
                r.reactivadas > 0 ? `${String(r.reactivadas)} volvieron a estar activas.` : null,
              ]
                .filter((x): x is string => x !== null)
                .join(' '),
            );
            void refrescar();
          }}
        />
      ) : null}

      <DialogoDeConfirmacion
        abierto={borrado !== null}
        titulo={`Borrar definitivamente ${borrado === null ? '' : nombreDeVivienda(vocabulario, borrado.identificador, borrado.agrupacion)}`}
        descripcion="Esto BORRA la vivienda. Solo se permite si no tiene ningún residente, vehículo, autorización ni evento: con historial, el sistema lo rechaza y dice qué lo impide."
        etiquetaConfirmar="Borrar definitivamente"
        enviando={enviando}
        error={error}
        sinMotivo
        alConfirmar={() => void borrarDefinitivamente()}
        alCancelar={() => {
          setBorrado(null);
          setError(undefined);
        }}
      >
        <p className="rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto">
          Es para la vivienda <strong>creada por error</strong>. Si ya tiene historial, use
          «Desactivar»: el historial de accesos no se borra nunca (RN-19).
        </p>
      </DialogoDeConfirmacion>

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={`Desactivar ${baja === null ? '' : nombreDeVivienda(vocabulario, baja.identificador, baja.agrupacion)}`}
        descripcion="La vivienda deja de generar autorizaciones nuevas y conserva todo su historial. No se borra nada."
        etiquetaConfirmar="Desactivar"
        enviando={enviando}
        error={error}
        sugerencias={['Vivienda desocupada', 'Cambio de propietario', 'Error de registro']}
        alConfirmar={(motivo) => void desactivar(motivo)}
        alCancelar={() => {
          setBaja(null);
          setError(undefined);
        }}
      >
        {baja !== null && baja.autorizacionesVigentes > 0 ? (
          <p className="rounded-md border border-aviso bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto">
            Conserva <strong>{baja.autorizacionesVigentes}</strong> autorización
            {baja.autorizacionesVigentes === 1 ? '' : 'es'} vigente
            {baja.autorizacionesVigentes === 1 ? '' : 's'}: seguirán permitiendo el acceso hasta que
            expiren o se revoquen (RN-13).
          </p>
        ) : null}
      </DialogoDeConfirmacion>
    </>
  );
};
