import type { JSX, ReactNode } from 'react';
import { Building2, Clock, Lock, ShieldCheck, UserRound } from 'lucide-react';
import type { Sesion } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Distintivo } from '@/componentes/ui/distintivo';
import { NOMBRE_DE_ROL } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import type { AlcanceActivo } from '../copropiedad';
import { FormularioDeConfiguracion } from './formulario';

/**
 * Configuración, ahora editable (bloque 7 de la ETAPA 09-B).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES CLASES DE AJUSTE, Y CADA UNA SE VE
 *
 * · **Editable por el administrador**: identidad de la copropiedad y operación
 *   corriente —nombre, zona horaria, margen de latido—.
 * · **Editable sólo por el superadministrador**: lo que decide aperturas. El
 *   umbral de confianza de placa marca por debajo de qué valor una lectura NO
 *   abre sola (CU-01, excepción 3a), y la contingencia del Edge dice qué hace
 *   cuando la regla no está en su caché (RN-16). No son preferencias.
 * · **Solo lectura, con el motivo a la vista**: cota legal, integridad o
 *   trazabilidad. El plazo de consentimiento biométrico lo fija la Ley 1581 de
 *   2012 como MÁXIMO —no como valor por defecto—, el NIT identifica fiscalmente
 *   a la copropiedad y sostiene un índice único, y el margen de caché del Edge
 *   sostiene el marcado de decisiones con caché potencialmente obsoleto
 *   (KPI-31).
 *
 * **Solo lectura con el motivo visible no es lo mismo que oculto.** Lo oculto
 * parece que no existe y acaba pedido otra vez; lo visible con su razón cierra
 * la conversación y documenta el sistema para quien lo audita.
 *
 * La lista de quién puede tocar qué la declara la API en `editables` y esta
 * pantalla la obedece: si viviera aquí, el día que un ajuste cambie de rol la
 * consola pintaría el campo abierto y el servidor devolvería 422.
 */
/**
 * Par etiqueta-valor. `bloqueado` es el motivo por el que ese ajuste NO se
 * edita desde aquí, y se pinta con candado a propósito: el usuario tiene que
 * poder distinguir «esto todavía no está» de «esto no se toca, y por esto».
 */
const Dato = ({
  etiqueta,
  children,
  ayuda,
  bloqueado,
}: {
  readonly etiqueta: string;
  readonly children: ReactNode;
  readonly ayuda?: string;
  readonly bloqueado?: string;
}): JSX.Element => (
  <div className="border-b border-borde py-3 last:border-b-0">
    <dt className="flex items-center gap-1.5 text-etiqueta uppercase tracking-wide text-texto-apagado">
      {etiqueta}
      {bloqueado !== undefined ? (
        <>
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2} />
          <span className="sr-only">Solo lectura</span>
        </>
      ) : null}
    </dt>
    <dd className="mt-1 text-cuerpo text-texto">{children}</dd>
    {ayuda !== undefined ? (
      <p className="mt-0.5 text-secundario text-texto-apagado">{ayuda}</p>
    ) : null}
    {bloqueado !== undefined ? (
      <p className="mt-0.5 text-secundario text-texto-apagado">{bloqueado}</p>
    ) : null}
  </div>
);

/**
 * `lista` decide si el cuerpo es un `<dl>` de pares etiqueta-valor o contenido
 * libre. No es cosmética: `<dt>` y `<dd>` **exigen** un `<dl>` por padre, y
 * meter un formulario dentro de uno produce marcado que el navegador
 * reinterpreta y que un lector de pantalla anuncia mal.
 */
const Bloque = ({
  titulo,
  descripcion,
  icono,
  children,
  lista = true,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly icono: ReactNode;
  readonly children: ReactNode;
  readonly lista?: boolean;
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
    {lista ? <dl className="mt-4">{children}</dl> : <div className="mt-4">{children}</div>}
  </section>
);

export const PantallaDeConfiguracion = ({
  sesion,
  alcance,
}: {
  readonly sesion: Sesion;
  readonly alcance: AlcanceActivo;
}): JSX.Element => {
  return (
    <>
      <EncabezadoDePantalla
        titulo="Configuración"
        descripcion="Identidad de la copropiedad activa, plazos de conservación de datos y estado de tu sesión."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque
          titulo="Copropiedad activa"
          descripcion="La que están viendo el resto de pantallas. Cada cambio queda anotado en la auditoría de seguridad."
          icono={<Building2 className="h-5 w-5" strokeWidth={1.75} />}
          lista={false}
        >
          <div className="pt-1">
            <FormularioDeConfiguracion copropiedadId={alcance.copropiedadId ?? ''} />
          </div>
          <dl className="mt-5 border-t border-borde pt-1">
            <Dato
              etiqueta="Identificador"
              ayuda="Se necesita para los guiones de aprovisionamiento."
            >
              <span className="break-all font-mono text-secundario">{alcance.copropiedadId}</span>
            </Dato>
          </dl>
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
          descripcion="Solo lectura, y aquí está el motivo de cada uno."
          icono={<Clock className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato
            etiqueta="Eventos de acceso"
            bloqueado="Cota de retención en el esquema (migración 0016). Acortarla desde la consola destruiría la trazabilidad que sostiene RN-03."
          >
            Purga por particiones mensuales · 24 meses
          </Dato>
          <Dato
            etiqueta="Evidencia fotográfica"
            bloqueado="90 días por defecto. El evento conserva el hash aunque el objeto se borre: el plazo no se afloja desde una pantalla."
          >
            Borrado del objeto, con constancia en el libro de purgas
          </Dato>
          <Dato
            etiqueta="Plazo de consentimiento biométrico"
            bloqueado="Cota LEGAL de la Ley 1581 de 2012, no valor por defecto: 24 h como máximo, nunca más. Un campo aquí invitaría a subirlo, que es justo lo que la ley prohíbe."
          >
            Supresión inmediata al revocar el consentimiento
          </Dato>
          <Dato
            etiqueta="Margen de caché de reglas del Edge"
            bloqueado="Decide cuándo una decisión tomada sin WAN se marca como potencialmente obsoleta (KPI-31). Aflojarlo degradaría en silencio la auditoría del Edge."
          >
            24 horas
          </Dato>
          <Dato
            etiqueta="NIT de la copropiedad"
            bloqueado="Identidad fiscal con índice único. Cambiarlo no es configurar: es sustituir el tenant, y va por procedimiento con constancia."
          >
            Se consulta en el padrón de la copropiedad
          </Dato>
        </Bloque>

        <Bloque
          titulo="Seguridad"
          descripcion="Lo que está activo ahora mismo, no lo que está previsto."
          icono={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
        >
          <Dato
            etiqueta="Segundo factor obligatorio"
            bloqueado="Superadministrador, administrador y operador de central (RN-20, CA-25). Un interruptor para apagarlo sería el propio agujero."
          >
            Tres roles administrativos
          </Dato>
          <Dato
            etiqueta="Aislamiento entre copropiedades"
            bloqueado="Comprobado por los dos caminos: RLS en la base y contexto en la aplicación. No es configurable por definición."
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
