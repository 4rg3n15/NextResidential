import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeBiometria } from './pantalla';

export const metadata: Metadata = { title: 'Rostro del visitante' };
export const dynamic = 'force-dynamic';

/**
 * Captura biométrica desde la consola — **anticipo autorizado del punto 4 de la
 * ETAPA 16**, no alcance de la 15.
 *
 * Hasta hoy la captura existía sólo en la app del residente (ADR-016), así que
 * el recorrido facial no se podía originar desde el escritorio y el
 * superadministrador no tenía por dónde adjuntar un rostro. Esta pantalla
 * **no inventa un camino nuevo**: usa los mismos casos de uso de la ETAPA 08
 * —calidad (CA-08), consentimiento del TITULAR (RN-09, RN-10) y
 * sincronización—, con otra puerta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * B.6 · EL TITULAR PUEDE VENIR PRESELECCIONADO
 *
 * Quien llega desde «Nueva autorización» trae ya al visitante elegido. Es sólo
 * un atajo de navegación: el identificador llega en la URL y la pantalla lo usa
 * para rellenar el buscador, que sigue siendo editable. **No salta ninguna
 * comprobación** —la calidad (CA-08), el consentimiento del TITULAR (RN-09,
 * RN-10) y la validación por tipo real del fichero siguen decidiéndose donde se
 * decidían—, y si el parámetro es basura el buscador se queda vacío, que es el
 * comportamiento de siempre.
 */
const Biometria = async ({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  const parametros = await searchParams;
  const uno = (clave: string): string | undefined => {
    const valor = parametros[clave];
    return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
  };
  const titularId = uno('titular');
  const nombre = uno('nombre');
  const documento = uno('documento');

  return (
    <PantallaDeBiometria
      copropiedadId={copropiedadId}
      {...(titularId === undefined
        ? {}
        : {
            titularInicial: {
              id: titularId,
              nombreCompleto: nombre ?? 'Visitante autorizado',
              // El documento NO viaja en la URL salvo que ya estuviera ahí: es
              // un dato personal y una URL acaba en el historial, en el
              // registro del servidor y en el portapapeles de quien la comparte.
              documento: documento ?? '',
            },
          })}
    />
  );
};

export default Biometria;
