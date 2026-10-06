'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import {
  clavesDelResidente,
  useMiPerfil,
  useMiVivienda,
  useMisOcupantes,
} from '@/lib/api/residente';
import type { PerfilDelResidente } from '@/lib/api/residente';
import { fechaCorta } from '@/lib/fechas';
import { Seccion, estadoDeConsulta, legible, tituloDeVivienda } from '../comunes';
import { EditarPerfil, TIPOS_DE_DOCUMENTO } from './editar-perfil';

const TIPO_DE_DOCUMENTO: Readonly<Record<string, string>> = Object.fromEntries(
  TIPOS_DE_DOCUMENTO.map((t) => [t.valor, t.etiqueta]),
);

const Fila = ({
  etiqueta,
  valor,
}: {
  readonly etiqueta: string;
  readonly valor: string;
}): JSX.Element => (
  <div className="grid gap-1 border-b border-borde-suave py-2 last:border-b-0 sm:grid-cols-3">
    <dt className="text-secundario text-texto-apagado">{etiqueta}</dt>
    <dd className="text-cuerpo text-texto sm:col-span-2">{valor}</dd>
  </div>
);

const documentoDe = (p: PerfilDelResidente): string =>
  p.numeroDocumento === null
    ? 'Sin documento'
    : `${p.tipoDocumento === null ? 'Documento' : legible(p.tipoDocumento, TIPO_DE_DOCUMENTO)} ${p.numeroDocumento}`;

/**
 * M-8 · «Perfil»: mis datos (editables), mi conjunto con el teléfono de la
 * portería, mis ocupantes con los códigos de las plazas libres y los atajos.
 * Cambiar de vivienda y cambiar la contraseña quedan fuera de esta entrega:
 * exigen flujos que la consola no tiene todavía (se declara en el informe).
 */
export const PantallaDeMiPerfil = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const perfil = useMiPerfil(copropiedadId);
  const hogar = useMiVivienda(copropiedadId);
  const ocupantes = useMisOcupantes(copropiedadId);
  const [editando, setEditando] = useState<PerfilDelResidente | null>(null);
  const p = perfil.data;
  const nombre = p?.nombreCompleto.trim() ?? '';

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Perfil"
        descripcion="Tu cuenta, tus datos de contacto y tu conjunto."
      />
      <Tarjeta>
        <CuerpoDeTarjeta className="flex items-center gap-3 pt-5">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marca-suave text-seccion font-bold text-marca-texto"
          >
            {nombre === '' ? '?' : nombre.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-texto">{nombre === '' ? 'Mi cuenta' : nombre}</p>
            {hogar.data !== undefined ? (
              <p className="text-secundario text-texto-apagado">
                {tituloDeVivienda(hogar.data.vivienda)} ·{' '}
                {hogar.data.vinculo.esTitular ? 'Titular' : 'Residente'}
              </p>
            ) : null}
          </div>
        </CuerpoDeTarjeta>
      </Tarjeta>

      {estadoDeConsulta(perfil, 'Cargando tu perfil')}
      {p !== undefined ? (
        <>
          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Mis datos"
              accion={
                <Boton variante="secundario" tamano="sm" onClick={() => setEditando(p)}>
                  Editar
                </Boton>
              }
            />
            <CuerpoDeTarjeta>
              <dl>
                <Fila etiqueta="Correo de contacto" valor={p.correo ?? 'Sin correo de contacto'} />
                <Fila etiqueta="Teléfono" valor={p.telefono ?? 'Sin teléfono'} />
                <Fila etiqueta="Documento" valor={documentoDe(p)} />
                {p.fechaNacimiento !== null ? (
                  <Fila etiqueta="Fecha de nacimiento" valor={fechaCorta(p.fechaNacimiento)} />
                ) : null}
              </dl>
            </CuerpoDeTarjeta>
          </Tarjeta>
          <Tarjeta>
            <CabeceraDeTarjeta
              titulo={p.copropiedadNombre}
              descripcion={p.copropiedadDireccion ?? 'Sin dirección registrada'}
            />
            <CuerpoDeTarjeta>
              <dl>
                <Fila
                  etiqueta="Teléfono de portería"
                  valor={p.telefonoPorteria ?? 'La administración no registró el teléfono'}
                />
              </dl>
              {p.telefonoPorteria !== null ? (
                <a
                  href={`tel:${p.telefonoPorteria}`}
                  className="mt-2 inline-block text-secundario font-medium text-marca-texto"
                >
                  Llamar a portería
                </a>
              ) : null}
            </CuerpoDeTarjeta>
          </Tarjeta>
        </>
      ) : null}

      {ocupantes.data?.declarada === true ? (
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo={`Ocupantes: ${String(ocupantes.data.declarados)}`}
            descripcion="El titular añade o retira plazas desde la app, hasta el tope de la vivienda; para más, la administración."
          />
          <CuerpoDeTarjeta>
            <ul aria-label="Plazas de ocupante">
              {ocupantes.data.plazas.map((plaza) => (
                <li
                  key={plaza.id}
                  className="flex items-center gap-3 border-b border-borde-suave py-2 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutro-suave text-distintivo font-bold text-neutro-texto"
                  >
                    {plaza.numero}
                  </span>
                  <span className="text-cuerpo text-texto">
                    {plaza.libre ? 'Plaza libre' : (plaza.ocupante ?? 'Ocupada')}
                  </span>
                  {plaza.libre && plaza.codigo !== null ? (
                    <span className="ml-auto font-mono text-secundario text-texto-apagado">
                      Código: {plaza.codigo}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CuerpoDeTarjeta>
        </Tarjeta>
      ) : null}

      <Seccion titulo="Atajos">
        <Tarjeta>
          <ul className="px-5">
            {[
              ['Mi familia', '/mi/familia'],
              ['Mis vehículos', '/mi/vehiculos'],
              ['Historial de accesos', '/mi/historial'],
              ['Notificaciones', '/mi/notificaciones'],
            ].map(([texto, ruta]) => (
              <li key={ruta} className="border-b border-borde-suave last:border-b-0">
                <Link
                  href={ruta ?? '/mi'}
                  prefetch={false}
                  className="block py-3 text-cuerpo text-texto hover:text-marca-texto"
                >
                  {texto}
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </Seccion>

      <EditarPerfil
        copropiedadId={copropiedadId}
        perfil={editando}
        alCerrar={() => setEditando(null)}
        alGuardar={() =>
          void consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) })
        }
      />
    </div>
  );
};
