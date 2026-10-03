import type { EquipoRegistrado } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import type { EntregaAlEdge } from '../../comun/credenciales-en-el-edge';

/**
 * 15-Q2 · D1-D3 · lo que la aplicación necesita para entregar credenciales al
 * Edge, como PUERTOS. Quien habla con el túnel —y con sus errores, que son del
 * paquete del hardware— es la infraestructura (`credenciales-del-puente.ts`):
 * la aplicación sólo importa tipos de `@ncr/providers` (O2).
 */
export type EquipoSinClave = Omit<EquipoRegistrado, 'clave' | 'usuario'> & {
  readonly usuario: string | null;
};

export interface LecturaParaElEdge {
  /** El equipo como lo tiene la base, sin credencial. `null` si no existe o está de baja. */
  sinClave(dispositivoId: string): Promise<EquipoSinClave | null>;
  /** El secreto del Alarm Server de una cámara, descifrado. `null` si no tiene. */
  secretoDeCamara(ctx: ContextoTenant, copropiedadId: string, id: string): Promise<string | null>;
}

export interface MarcaDeCredencial {
  /** `credencial_ref = edge:<gateway>` y, si se entregó una clave, su huella. */
  enElEdge(copropiedadId: string, id: string, edgeId: string, huella: string | null): Promise<void>;
}

export type Huella = (copropiedadId: string, dispositivoId: string, clave: string) => string;

/** Entregar un equipo (con o sin su clave) al Edge de la copropiedad; contesta si autentica. */
export type EntregarAlEdge = (
  copropiedadId: string,
  equipo: Record<string, unknown>,
) => Promise<EntregaAlEdge>;
