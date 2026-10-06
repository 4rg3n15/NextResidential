'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { CuentaDeResidente } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, mensajeDeFallo } from '@/lib/api/cliente';
import { useCuentasDeResidentes } from './consultas';
import { DialogoDeResidente, DialogoDeRestablecimientoDeResidente } from './dialogos';
import { DialogoDeAsignacionDeVivienda } from './asignar-vivienda';
import { DialogoDeBajaDeResidente } from './baja-de-residente';
import { OcupantesPorVivienda } from './ocupantes';
import { DialogoDePerfilDeResidente } from './perfil-de-residente';
import { VehiculosDeResidentes } from './vehiculos-de-residentes';

/**
 * 15-W · de dónde salió la cuenta, con el tipo del CONTRATO: si la API añade un
 * tercer origen, esto deja de compilar en vez de pintar una celda vacía.
 */
const ORIGEN: Readonly<Record<CuentaDeResidente['origen'], string>> = {
  administracion: 'Administración',
  autorregistro: 'Crear cuenta (app)',
};

/** Sólo una cuenta ACTIVA sin vivienda puede recibirla: a una de baja la API le diría 404. */
const puedeRecibirVivienda = (c: CuentaDeResidente): boolean => c.activa && c.vivienda === null;

/**
 * PANEL DE RESIDENTES · superadministrador (ETAPA 15-I: 3.1, D4, D5 a, D6).
 *
 * Tres secciones con el patrón de la consola: las cuentas de residente (alta
 * por usuario y restablecimiento), los ocupantes de cada vivienda y los
 * vehículos que registraron los residentes. Todo por la API con el cliente
 * generado; nada toca la base desde el navegador.
 *
 * Ronda 15-W: el alta es la del TITULAR de una vivienda, y la tabla dice el
 * ORIGEN de cada cuenta —la administración o «Crear cuenta» en la app con un
 * código de plaza— y cuáles siguen sin vivienda, con la acción que lo resuelve.
 */
export const PantallaDeResidentes = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const cuentas = useCuentasDeResidentes(copropiedadId);
  const [alta, setAlta] = useState(false);
  const [restablecer, setRestablecer] = useState<CuentaDeResidente | null>(null);
  const [perfil, setPerfil] = useState<CuentaDeResidente | null>(null);
  // C9 (15-M) · «eliminar» = baja con motivo (RN-19, CA-02).
  const [bajaDe, setBajaDe] = useState<CuentaDeResidente | null>(null);
  const [asignarA, setAsignarA] = useState<CuentaDeResidente | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = cuentas.data ?? [];
  const sinVivienda = lista.filter(puedeRecibirVivienda).length;

  const columnas: readonly Columna<CuentaDeResidente>[] = [
    {
      clave: 'nombre',
      titulo: 'Residente',
      celda: (c) => (
        <div>
          <p className="font-medium text-texto">{c.nombre}</p>
          <p className="text-secundario text-texto-apagado">{c.usuario ?? 'cuenta por correo'}</p>
        </div>
      ),
      texto: (c) => `${c.nombre} ${c.usuario ?? ''}`,
    },
    {
      clave: 'vivienda',
      titulo: 'Vivienda',
      // De baja no hay nada que resolver: el aviso sólo donde «Asignar vivienda» sirve.
      celda: (c) =>
        c.vivienda === null ? (
          <Distintivo tono={c.activa ? 'aviso' : 'neutro'}>Sin vivienda</Distintivo>
        ) : (
          c.vivienda
        ),
      texto: (c) => c.vivienda ?? '',
    },
    {
      clave: 'origen',
      titulo: 'Origen',
      celda: (c) => <span className="text-secundario text-texto-apagado">{ORIGEN[c.origen]}</span>,
      texto: (c) => ORIGEN[c.origen],
    },
    {
      clave: 'cuenta',
      titulo: 'Cuenta',
      celda: (c) =>
        c.debeCambiarContrasena ? (
          <Distintivo tono="aviso">Primer ingreso pendiente</Distintivo>
        ) : c.activa ? (
          <Distintivo tono="exito">Activa</Distintivo>
        ) : (
          <Distintivo tono="neutro">De baja</Distintivo>
        ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (c) => (
        <div className="flex flex-wrap justify-end gap-1">
          {puedeRecibirVivienda(c) ? (
            <Boton variante="secundario" tamano="sm" onClick={() => setAsignarA(c)}>
              Asignar vivienda
            </Boton>
          ) : null}
          <Boton
            variante="fantasma"
            tamano="sm"
            onClick={() => setPerfil(c)}
            disabled={c.vivienda === null}
            title={c.vivienda === null ? 'Tendrá perfil cuando tenga vivienda' : undefined}
          >
            Editar perfil
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => setRestablecer(c)}>
            Restablecer contraseña
          </Boton>
          {c.activa ? (
            <Boton variante="peligro" tamano="sm" onClick={() => setBajaDe(c)}>
              Dar de baja
            </Boton>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Residentes"
        descripcion="Cuentas de residentes, ocupantes por vivienda y vehículos que registraron. Cada vivienda tiene un titular, al que da de alta la administración; los demás de su hogar crean su cuenta en la app con un código de plaza."
        resumen={
          cuentas.isSuccess ? `${lista.length} cuentas · ${sinVivienda} sin vivienda` : undefined
        }
        acciones={<Boton onClick={() => setAlta(true)}>Nuevo residente</Boton>}
      />
      {aviso !== null ? (
        <p
          role="status"
          className="rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado"
        >
          {aviso}
        </p>
      ) : null}
      {cuentas.isError ? (
        estadoSegunCodigo(
          cuentas.error instanceof ErrorDeApi ? cuentas.error : 0,
          mensajeDeFallo(cuentas.error),
          () => void cuentas.refetch(),
        )
      ) : (
        <TablaDeDatos
          titulo="Cuentas de residentes"
          columnas={columnas}
          filas={lista}
          claveDeFila={(c) => c.usuarioId}
          cargando={cuentas.isPending}
          vacio={{
            titulo: 'Sin residentes con cuenta',
            descripcion: 'Da de alta el primero con «Nuevo residente».',
          }}
          buscador={{ marcador: 'Buscar por nombre, usuario o vivienda' }}
        />
      )}
      <OcupantesPorVivienda copropiedadId={copropiedadId} />
      <VehiculosDeResidentes copropiedadId={copropiedadId} />
      <DialogoDeResidente
        copropiedadId={copropiedadId}
        abierto={alta}
        alCerrar={() => setAlta(false)}
        alDarDeAlta={setAviso}
      />
      <DialogoDeAsignacionDeVivienda
        copropiedadId={copropiedadId}
        cuenta={asignarA}
        alCerrar={() => setAsignarA(null)}
        alAsignar={setAviso}
      />
      <DialogoDePerfilDeResidente
        copropiedadId={copropiedadId}
        cuenta={perfil}
        alCerrar={() => setPerfil(null)}
      />
      <DialogoDeRestablecimientoDeResidente
        copropiedadId={copropiedadId}
        cuenta={restablecer}
        alCerrar={() => setRestablecer(null)}
      />
      <DialogoDeBajaDeResidente
        copropiedadId={copropiedadId}
        cuenta={bajaDe}
        alCerrar={() => setBajaDe(null)}
        alDarDeBaja={setAviso}
      />
    </div>
  );
};
