import type { JSX, ReactNode } from 'react';
import { Building2, Clock, ShieldCheck, UserRound } from 'lucide-react';
import type { Sesion } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Distintivo } from '@/componentes/ui/distintivo';
import { NOMBRE_DE_ROL } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import type { AlcanceActivo } from '../copropiedad';

/**
 * Configuración: lo que hoy solo se sabía entrando a la base de datos.
 *
 * Es una pantalla de **lectura**, y eso es una decisión, no una carencia. Los
 * plazos de retención y el margen de supresión biométrica tienen cota legal en
 * el esquema (migraciones 0016 y 0022); ofrecer aquí un campo para editarlos
 * invitaría a intentar un valor que la base va a rechazar. Cuando se editen,
 * será con los límites visibles en el propio control.
 *
 * Se listan **pares etiqueta-valor** —el componente recurrente que el sistema
 * de diseño derivó del mockup (§5.5)— en vez de tarjetas con cifras grandes:
 * aquí no hay nada que medir, solo que confirmar.
 */
const Dato = ({
  etiqueta,
  children,
  ayuda,
}: {
  readonly etiqueta: string;
  readonly children: ReactNode;
  readonly ayuda?: string;
}): JSX.Element => (
  <div className="border-b border-borde py-3 last:border-b-0">
    <dt className="text-etiqueta uppercase tracking-wide text-texto-apagado">{etiqueta}</dt>
    <dd className="mt-1 text-cuerpo text-texto">{children}</dd>
    {ayuda !== undefined ? (
      <p className="mt-0.5 text-secundario text-texto-apagado">{ayuda}</p>
    ) : null}
  </div>
);

const Bloque = ({
  titulo,
  descripcion,
  icono,
  children,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly icono: ReactNode;
  readonly children: ReactNode;
}): JSX.Element => (
  <section className="rounded-tarjeta border border-borde bg-tarjeta p-5">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-boton bg-marca-suave text-marca-texto"
      >
        {icono}
      </span>
      <div className="min-w-0">
        <h2 className="text-seccion text-texto">{titulo}</h2>
        <p className="mt-0.5 text-secundario text-texto-apagado">{descripcion}</p>
      </div>
    </div>
    <dl className="mt-4">{children}</dl>
  </section>
);

export const PantallaDeConfiguracion = ({
  sesion,
  alcance,
}: {
  readonly sesion: Sesion;
  readonly alcance: AlcanceActivo;
}): JSX.Element => {
  const activa = alcance.disponibles.find((c) => c.id === alcance.copropiedadId);

  return (
    <>
      <EncabezadoDePantalla
        titulo="Configuración"
        descripcion="Identidad de la copropiedad activa, plazos de conservación de datos y estado de tu sesión."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque
          titulo="Copropiedad activa"
          descripcion="La que están viendo el resto de pantallas."
          icono={<Building2 className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato etiqueta="Nombre">{activa?.nombre ?? 'Sin determinar'}</Dato>
          <Dato
            etiqueta="Zona horaria"
            ayuda="Decide qué significa «hoy» en el tablero y en los informes."
          >
            <span className="font-mono">{activa?.zonaHoraria ?? '—'}</span>
          </Dato>
          <Dato etiqueta="Identificador" ayuda="Se necesita para los guiones de aprovisionamiento.">
            <span className="break-all font-mono text-secundario">{alcance.copropiedadId}</span>
          </Dato>
        </Bloque>

        <Bloque
          titulo="Tu sesión"
          descripcion="Lo que la API reconoce de tu token, no lo que dice el navegador."
          icono={<UserRound className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato etiqueta="Rol">{NOMBRE_DE_ROL[sesion.rol as Rol]}</Dato>
          <Dato etiqueta="Segundo factor">
            {sesion.mfaVerificado ? (
              <Distintivo tono="exito">Verificado</Distintivo>
            ) : (
              <Distintivo tono="aviso">Pendiente</Distintivo>
            )}
          </Dato>
          <Dato
            etiqueta="Alcance"
            {...(alcance.alcanceGlobal
              ? {
                  ayuda: 'El superadministrador no pertenece a una copropiedad: las alcanza todas.',
                }
              : {})}
          >
            {alcance.alcanceGlobal
              ? `Global · ${alcance.disponibles.length} copropiedades`
              : 'Una copropiedad'}
          </Dato>
        </Bloque>

        <Bloque
          titulo="Conservación de datos"
          descripcion="Plazos con cota legal en el esquema. Se muestran, no se editan aquí."
          icono={<Clock className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato etiqueta="Eventos de acceso" ayuda="Por defecto 24 meses (migración 0016).">
            Purga por particiones mensuales
          </Dato>
          <Dato
            etiqueta="Evidencia fotográfica"
            ayuda="Por defecto 90 días. El evento conserva el hash."
          >
            Borrado del objeto, con constancia en el libro de purgas
          </Dato>
          <Dato
            etiqueta="Plantillas biométricas"
            ayuda="Atadas a la vigencia de su autorización. La ley actúa como cota superior: 24 h como máximo, nunca más."
          >
            Supresión inmediata al revocar el consentimiento
          </Dato>
        </Bloque>

        <Bloque
          titulo="Seguridad"
          descripcion="Lo que está activo ahora mismo, no lo que está previsto."
          icono={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato
            etiqueta="Segundo factor obligatorio"
            ayuda="Superadministrador, administrador y operador de central (RN-20, CA-25)."
          >
            Tres roles administrativos
          </Dato>
          <Dato
            etiqueta="Aislamiento entre copropiedades"
            ayuda="Comprobado por los dos caminos: RLS en la base y contexto en la aplicación."
          >
            Activo y forzado
          </Dato>
          <Dato
            etiqueta="Gestión de usuarios y restablecimientos"
            ayuda="Se diseña en el bloque 4 de esta etapa. Hoy se aprovisiona con los guiones de docs/guias/RECUPERACION_Y_USUARIOS.md."
          >
            <Distintivo tono="neutro">Pendiente de diseño</Distintivo>
          </Dato>
        </Bloque>
      </div>
    </>
  );
};
