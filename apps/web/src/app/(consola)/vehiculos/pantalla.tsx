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
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [placa, setPlaca] = useState('');
  const [viviendaId, setViviendaId] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [color, setColor] = useState('');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['valor']>('automovil');

  const normalizada = vistaPreviaDePlaca(placa);

  const refrescar = async (): Promise<void> => {
    await clientes.invalidateQueries({ queryKey: ['vehiculos', copropiedadId] });
  };

  const registrar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/padron/vehiculos', {
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
      setPlaca('');
      setMarca('');
      setModelo('');
      setColor('');
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
        await cliente.POST('/padron/vehiculos/{id}/desactivacion', {
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
      celda: (v) =>
        v.estado === 'activo' ? (
          <Boton variante="secundario" tamano="sm" onClick={() => setBaja(v)}>
            Desactivar
          </Boton>
        ) : null,
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
            className="w-full rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
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
            className="w-full rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
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
