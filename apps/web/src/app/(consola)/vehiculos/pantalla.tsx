'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Vehiculo } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo, DistintivoDePlaca } from '@/componentes/ui/distintivo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useVehiculos, useViviendas } from '@/lib/api/consultas';
import { vistaPreviaDePlaca } from './normalizar-placa';

const TIPOS = [
  { valor: 'automovil', etiqueta: 'Automóvil' },
  { valor: 'motocicleta', etiqueta: 'Motocicleta' },
  { valor: 'bicicleta', etiqueta: 'Bicicleta' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;

/**
 * Vehículos y placas.
 *
 * **La placa se normaliza rechazando, no limpiando**, y esta pantalla lo hace
 * visible: mientras se escribe, muestra en qué se va a convertir; si el dominio
 * la rechaza, **el mensaje se muestra tal como llega**. No se reinterpreta ni
 * se sustituye por uno «más amable»: el backend dice «solo admite letras y
 * dígitos» o «entre 5 y 8 caracteres tras normalizar», y esos dos mensajes
 * llevan a arreglos distintos. Uno genérico —«placa inválida»— los borraría.
 */
export const PantallaDeVehiculos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clientes = useQueryClient();
  const consulta = useVehiculos(copropiedadId);
  // Para elegir vivienda en el alta. Solo las ACTIVAS: una inactiva no debe
  // recibir vehículos nuevos, aunque conserve los que ya tenía (RN-13).
  const viviendas = useViviendas(copropiedadId, { estado: 'activo', busqueda: '' });

  const [alta, setAlta] = useState(false);
  const [baja, setBaja] = useState<Vehiculo | null>(null);
  /** O3 · edición y borrado DEFINITIVO (sólo sin historial; lo decide la base). */
  const [editar, setEditar] = useState<Vehiculo | null>(null);
  const [borrado, setBorrado] = useState<Vehiculo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [placa, setPlaca] = useState('');
  const [viviendaId, setViviendaId] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [color, setColor] = useState('');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['valor']>('automovil');

  const normalizada = vistaPreviaDePlaca(placa);

  const abrirEdicion = (v: Vehiculo): void => {
    setEditar(v);
    setPlaca(v.placa);
    setMarca(v.marca ?? '');
    setModelo(v.modelo ?? '');
    setColor(v.color ?? '');
    setTipo(
      TIPOS.some((t) => t.valor === v.tipo) ? (v.tipo as (typeof TIPOS)[number]['valor']) : 'otro',
    );
    setError(undefined);
  };

  const limpiar = (): void => {
    setPlaca('');
    setMarca('');
    setModelo('');
    setColor('');
    setTipo('automovil');
  };

  const guardarEdicion = async (): Promise<void> => {
    if (editar === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.PUT('/copropiedades/{id}/padron/vehiculos/{vehiculoId}', {
          params: { path: { id: copropiedadId, vehiculoId: editar.id } },
          body: {
            // La placa sólo viaja si cambió: el dominio la normaliza y la base
            // decide si ya está activa en otra parte (RN-04, ADR-04).
            ...(placa.trim() === editar.placa ? {} : { placa: placa.trim() }),
            tipo,
            marca: marca.trim() === '' ? null : marca.trim(),
            modelo: modelo.trim() === '' ? null : modelo.trim(),
            color: color.trim() === '' ? null : color.trim(),
          },
        }),
      );
      setEditar(null);
      limpiar();
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo editar el vehículo');
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
        await cliente.DELETE('/copropiedades/{id}/padron/vehiculos/{vehiculoId}', {
          params: { path: { id: copropiedadId, vehiculoId: borrado.id } },
        }),
      );
      setBorrado(null);
      setAviso(`Se borró definitivamente ${r.placa}. No queda rastro del vehículo.`);
      await refrescar();
    } catch (e) {
      // La API dice cuántos eventos y autorizaciones lo impiden: viaja tal cual.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo borrar');
    } finally {
      setEnviando(false);
    }
  };

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['vehiculos', copropiedadId] });
  };

  const registrar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        // D-71 · la copropiedad de destino en la ruta, no en el token.
        await cliente.POST('/copropiedades/{id}/padron/vehiculos', {
          params: { path: { id: copropiedadId } },
          body: {
            viviendaId,
            // Se envía lo que el usuario escribió, NO la vista previa: la
            // normalización es del dominio, y mandarla ya normalizada haría
            // que un cambio en el VO dejara de aplicarse a lo que llega.
            placa,
            tipo,
            ...(marca.trim() === '' ? {} : { marca: marca.trim() }),
            ...(modelo.trim() === '' ? {} : { modelo: modelo.trim() }),
            ...(color.trim() === '' ? {} : { color: color.trim() }),
          },
        }),
      );
      setAlta(false);
      limpiar();
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo registrar el vehículo');
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
        await cliente.POST('/copropiedades/{id}/padron/vehiculos/{vehiculoId}/desactivacion', {
          params: { path: { id: copropiedadId, vehiculoId: baja.id } },
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

  const columnas: readonly Columna<Vehiculo>[] = [
    {
      clave: 'placa',
      titulo: 'Placa',
      texto: (v) => v.placa,
      celda: (v) => <DistintivoDePlaca placa={v.placa} />,
    },
    {
      clave: 'vehiculo',
      titulo: 'Vehículo',
      texto: (v) => `${v.marca ?? ''} ${v.modelo ?? ''} ${v.color ?? ''}`,
      celda: (v) => (
        <div>
          <p className="text-texto">{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</p>
          <p className="text-secundario text-texto-apagado">
            {TIPOS.find((t) => t.valor === v.tipo)?.etiqueta ?? v.tipo}
            {v.color !== null && v.color !== '' ? ` · ${v.color}` : ''}
          </p>
        </div>
      ),
    },
    {
      clave: 'propietario',
      titulo: 'Propietario / vivienda',
      texto: (v) => `${v.propietarioNombre ?? ''} ${v.viviendaIdentificador}`,
      celda: (v) => (
        <div>
          <p className="text-texto">{v.propietarioNombre ?? 'Sin propietario registrado'}</p>
          <p className="text-secundario text-texto-apagado">{v.viviendaIdentificador}</p>
        </div>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      texto: (v) => v.estado,
      celda: (v) => (
        <Distintivo tono={v.estado === 'activo' ? 'exito' : 'neutro'}>
          {v.estado === 'activo' ? 'Activo' : 'Inactivo'}
        </Distintivo>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (v) => (
        <span className="flex justify-end gap-2">
          {v.estado === 'activo' ? (
            <>
              <Boton variante="secundario" tamano="sm" onClick={() => abrirEdicion(v)}>
                Editar
              </Boton>
              <Boton variante="secundario" tamano="sm" onClick={() => setBaja(v)}>
                Desactivar
              </Boton>
            </>
          ) : null}
          <Boton variante="peligro" tamano="sm" onClick={() => setBorrado(v)}>
            Borrar
          </Boton>
        </span>
      ),
    },
  ];

  const activos = (consulta.data ?? []).filter((v) => v.estado === 'activo').length;

  return (
    <>
      <EncabezadoDePantalla
        titulo="Vehículos y placas"
        descripcion="Una placa activa por copropiedad; la garantía es de la base de datos, no del formulario (RN-04)."
        resumen={
          consulta.data === undefined ? null : (
            <>
              <Distintivo tono="exito">{activos} activos</Distintivo>
              <Distintivo tono="neutro">{consulta.data.length - activos} inactivos</Distintivo>
            </>
          )
        }
        acciones={<Boton onClick={() => setAlta(true)}>Registrar vehículo</Boton>}
      />

      {aviso !== null ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-exito bg-exito-suave px-3 py-2 text-secundario text-exito-texto"
        >
          {aviso}
        </p>
      ) : null}

      <TablaDeDatos
        titulo="Vehículos registrados"
        columnas={columnas}
        filas={consulta.data ?? []}
        claveDeFila={(v) => v.id}
        cargando={consulta.isLoading}
        buscador={{ marcador: 'Buscar por placa, marca, propietario o vivienda' }}
        vacio={{
          titulo: 'Sin vehículos',
          descripcion: 'Todavía no hay vehículos registrados en esta copropiedad.',
          accion: <Boton onClick={() => setAlta(true)}>Registrar vehículo</Boton>,
        }}
      />

      <DialogoDeFormulario
        abierto={editar !== null}
        titulo={`Editar ${editar?.placa ?? ''}`}
        descripcion="Placa, tipo, marca, modelo y color. Cambiar la placa la vuelve a normalizar; si ya está activa en otra vivienda, la base lo rechaza (RN-04)."
        etiquetaEnviar="Guardar cambios"
        enviando={enviando}
        error={error}
        puedeEnviar={placa.trim() !== ''}
        alEnviar={() => void guardarEdicion()}
        alCancelar={() => {
          setEditar(null);
          limpiar();
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
          ayuda={
            placa.trim() === ''
              ? undefined
              : `Se guardará como: ${normalizada || '(vacía tras normalizar)'}`
          }
          required
        />
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number]['valor'])}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo etiqueta="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <Campo etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <Campo etiqueta="Color" value={color} onChange={(e) => setColor(e.target.value)} />
      </DialogoDeFormulario>

      <DialogoDeConfirmacion
        abierto={borrado !== null}
        titulo={`Borrar definitivamente ${borrado?.placa ?? ''}`}
        descripcion="Esto BORRA el vehículo. Solo se permite si no tiene ningún evento ni autorización con su placa: con historial, el sistema lo rechaza y dice qué lo impide (RN-19)."
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
          Es para el vehículo <strong>registrado por error</strong>. Si ya pasó por la portería, use
          «Desactivar»: el historial de accesos no se borra nunca.
        </p>
      </DialogoDeConfirmacion>

      <DialogoDeFormulario
        abierto={alta}
        titulo="Registrar vehículo"
        descripcion="La placa se normaliza al guardarse. Si tras normalizar no cumple, se rechaza: no se limpia en silencio."
        etiquetaEnviar="Registrar"
        enviando={enviando}
        error={error}
        puedeEnviar={placa.trim() !== '' && viviendaId !== ''}
        alEnviar={() => void registrar()}
        alCancelar={() => {
          setAlta(false);
          setError(undefined);
        }}
      >
        <Campo
          etiqueta="Placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
          ayuda={
            placa.trim() === ''
              ? 'Se admiten guiones y espacios: se eliminan al normalizar.'
              : `Se guardará como: ${normalizada || '(vacía tras normalizar)'}`
          }
          required
        />
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Vivienda</span>
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
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number]['valor'])}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo etiqueta="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <Campo etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <Campo etiqueta="Color" value={color} onChange={(e) => setColor(e.target.value)} />
      </DialogoDeFormulario>

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={`Desactivar ${baja?.placa ?? ''}`}
        descripcion="El vehículo deja de estar activo y libera su placa para otra vivienda. El historial se conserva."
        etiquetaConfirmar="Desactivar"
        enviando={enviando}
        error={error}
        sugerencias={['Vehículo vendido', 'Residente se mudó', 'Placa registrada por error']}
        alConfirmar={(motivo) => void desactivar(motivo)}
        alCancelar={() => {
          setBaja(null);
          setError(undefined);
        }}
      />
    </>
  );
};
