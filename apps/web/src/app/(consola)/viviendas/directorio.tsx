'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Vivienda } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useViviendas } from '@/lib/api/consultas';
import { CargaDePadron } from './carga-de-padron';

/**
 * Directorio de viviendas.
 *
 * **Lo que esta pantalla tiene que decir y ninguna tabla dice sola:** una
 * vivienda inactiva **conserva sus autorizaciones vigentes** (RN-13). Sin ese
 * número junto al estado, «inactiva» se lee como «ya no deja entrar a nadie», y
 * es falso: las autorizaciones que ya existían siguen abriendo la puerta hasta
 * que expiren. Por eso la columna de estado lleva la cifra al lado y el diálogo
 * de baja la repite antes de confirmar.
 *
 * **No hay borrado.** El botón dice «Desactivar» y exige motivo, porque eso es
 * lo que ocurre: baja lógica con historial (RN-19, CA-02). Un botón «Eliminar»
 * que en realidad desactiva enseña al usuario algo que no es cierto sobre su
 * propio sistema.
 */
export const DirectorioDeViviendas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [estado, setEstado] = useState<'' | 'activo' | 'inactivo'>('');
  const [busqueda, setBusqueda] = useState('');
  const [alta, setAlta] = useState(false);
  const [baja, setBaja] = useState<Vivienda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [identificador, setIdentificador] = useState('');
  const [manzana, setManzana] = useState('');
  const [direccion, setDireccion] = useState('');

  const consulta = useViviendas(copropiedadId, { estado, busqueda });

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['viviendas', copropiedadId] });
  };

  const crear = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/padron/viviendas', {
          body: {
            identificador: identificador.trim(),
            ...(manzana.trim() === '' ? {} : { manzana: manzana.trim() }),
            ...(direccion.trim() === '' ? {} : { direccion: direccion.trim() }),
          },
        }),
      );
      setAlta(false);
      setIdentificador('');
      setManzana('');
      setDireccion('');
      await refrescar();
    } catch (e) {
      // El mensaje de la API viaja TAL CUAL: es quien sabe por qué rechazó
      // —identificador ya activo— y reinterpretarlo aquí produciría un texto
      // que no coincide con lo que ocurrió.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo crear la vivienda');
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
        await cliente.POST('/padron/viviendas/{id}/desactivacion', {
          params: { path: { id: baja.id } },
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
  const columnas: readonly Columna<Vivienda>[] = [
    {
      clave: 'identificador',
      titulo: 'Vivienda',
      texto: (v) => `${v.identificador} ${v.manzana ?? ''} ${v.direccion ?? ''}`,
      celda: (v) => (
        <div>
          <p className="font-medium text-texto">{v.identificador}</p>
          <p className="text-secundario text-texto-apagado">
            {[v.manzana, v.direccion].filter((x) => x !== null && x !== '').join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      clave: 'ocupacion',
      titulo: 'Residentes / vehículos',
      alineacion: 'derecha',
      celda: (v) => (
        <span className="tabular-nums">
          {v.residentes} / {v.vehiculos}
        </span>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      texto: (v) => v.estado,
      celda: (v) => (
        <div className="flex flex-col items-start gap-1">
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
        </div>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (v) =>
        v.estado === 'activo' ? (
          <Boton variante="secundario" tamano="sm" onClick={() => setBaja(v)}>
            Desactivar
          </Boton>
        ) : (
          <span className="text-secundario text-texto-apagado">
            {v.motivoDesactivacion ?? 'Sin motivo registrado'}
          </span>
        ),
    },
  ];

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
            <CargaDePadron alTerminar={() => void refrescar()} />
            <Boton onClick={() => setAlta(true)}>Nueva vivienda</Boton>
          </>
        }
      />

      <TablaDeDatos
        titulo="Viviendas de la copropiedad"
        columnas={columnas}
        filas={datos?.viviendas ?? []}
        claveDeFila={(v) => v.id}
        cargando={consulta.isLoading}
        // El buscador es del SERVIDOR y no el de la tabla, y hay uno solo. La
        // API acota a 500 filas: un filtro que solo mirara lo ya descargado
        // diría «sin resultados» sobre un padrón que sí tiene la vivienda,
        // que es la peor respuesta posible a una búsqueda.
        filtros={
          <>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Buscar</span>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Identificador, manzana o dirección"
                aria-label="Buscar viviendas en el padrón"
                className="w-64 rounded-campo border border-borde bg-white px-2 py-1.5 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
              />
            </label>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Estado</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as '' | 'activo' | 'inactivo')}
                className="rounded-campo border border-borde bg-white px-2 py-1.5 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
              >
                <option value="">Todas</option>
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
              </select>
            </label>
          </>
        }
        vacio={{
          titulo: 'Sin viviendas',
          descripcion:
            'El padrón de esta copropiedad está vacío. Crea la primera vivienda o carga el padrón desde un archivo.',
          accion: <Boton onClick={() => setAlta(true)}>Nueva vivienda</Boton>,
        }}
      />

      <DialogoDeFormulario
        abierto={alta}
        titulo="Nueva vivienda"
        descripcion="El identificador debe ser único entre las viviendas activas; lo garantiza la base de datos."
        etiquetaEnviar="Crear vivienda"
        enviando={enviando}
        error={error}
        puedeEnviar={identificador.trim().length > 0}
        alEnviar={() => void crear()}
        alCancelar={() => {
          setAlta(false);
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Identificador"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          ayuda="Como aparece en el conjunto: «Casa 12», «Torre B - 401»."
          required
        />
        <Campo etiqueta="Manzana" value={manzana} onChange={(e) => setManzana(e.target.value)} />
        <Campo
          etiqueta="Dirección"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
        />
      </DialogoDeFormulario>

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={`Desactivar ${baja?.identificador ?? ''}`}
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
