import { randomUUID } from 'node:crypto';
import type { AmbitoDelResidente, PerfilValido, VehiculoPropioValido } from '@ncr/domain-core';
import { COP_A, COP_B } from '../constantes';
import {
  USUARIO_R1,
  USUARIO_R2,
  USUARIO_RB,
  VIVIENDA_1,
  VIVIENDA_2,
  VIVIENDA_B,
} from './directorio-del-residente';
import type {
  AltaDeVehiculo,
  AltaDelResidente,
  BitacoraDeResidentes,
  CuentaDeResidente,
  CuentasDeResidentes,
  EstadoDeAltaGuardado,
  HechoDeResidente,
  OcupantesDeLaVivienda,
  PerfilDelResidente,
  PerfilGuardado,
  PlazaDeOcupante,
  VehiculoPropioGuardado,
  VehiculosPropios,
  VinculoEscrito,
  VinculoPedido,
  ViviendaEncontrada,
  VocabularioDeAlta,
} from '../../src/residente/aplicacion/puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL HOGAR DEL RESIDENTE EN MEMORIA · para el banco SIN base (ETAPA 15-I)
 *
 * Existe para que los barridos de aislamiento, de escalamiento y de primer
 * ingreso recorran las rutas nuevas con el mismo cableado que producción. Las
 * mismas DOS viviendas del doble del directorio, con marcas distinguibles: si
 * una ruta de R1 devolviera algo de R2, «Ruiz Vecino» aparecería en su cuerpo.
 *
 * NO demuestra nada de lo que la base sostiene —el tope bajo concurrencia, el
 * bloqueo por vivienda, la plaza que sólo se toma libre—: eso lo prueba
 * `test/residentes-y-vehiculos-pg.test.ts` contra PostgreSQL, y lo dice aquí
 * para que nadie tome un verde de esta suite por uno de aquélla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const plaza = (
  id: string,
  numero: number,
  usuarioId: string | null,
  ocupante: string | null,
): PlazaDeOcupante => ({ id, numero, generacion: 1, usuarioId, ocupante });

const perfil = (nombre: string, telefono: string): PerfilGuardado => ({
  nombres: nombre.split(' ')[0] ?? nombre,
  apellidos: nombre.split(' ').slice(1).join(' ') || null,
  nombreCompleto: nombre,
  fechaNacimiento: null,
  tipoDocumento: 'cedula',
  numeroDocumento: null,
  correo: null,
  telefono,
  copropiedadNombre: 'Copropiedad A',
  copropiedadDireccion: 'Calle 1 # 2-3',
  telefonoPorteria: '+576015550100',
});

const VIVIENDA_DE: ReadonlyMap<string, string> = new Map([
  [USUARIO_R1, VIVIENDA_1],
  [USUARIO_R2, VIVIENDA_2],
  [USUARIO_RB, VIVIENDA_B],
]);

export class HogarEnMemoria
  implements
    AltaDelResidente,
    OcupantesDeLaVivienda,
    VehiculosPropios,
    PerfilDelResidente,
    BitacoraDeResidentes,
    CuentasDeResidentes
{
  /** La instancia que la aplicación de pruebas usa: la suite mira aquí la bitácora. */
  static ultima: HogarEnMemoria | undefined;
  constructor() {
    HogarEnMemoria.ultima = this;
  }

  readonly bitacora: HechoDeResidente[] = [];
  private readonly plazasDe = new Map<string, PlazaDeOcupante[]>([
    [
      VIVIENDA_1,
      [
        plaza('60000000-0000-4000-8000-0000000000a1', 1, USUARIO_R1, 'Titular Uno'),
        plaza('60000000-0000-4000-8000-0000000000a2', 2, null, null),
      ],
    ],
    [VIVIENDA_2, [plaza('60000000-0000-4000-8000-0000000000b1', 1, USUARIO_R2, 'Ruiz Vecino')]],
  ]);
  private readonly perfiles = new Map<string, PerfilGuardado>([
    [USUARIO_R1, perfil('Titular Uno', '+573000000001')],
    [USUARIO_R2, perfil('Ruiz Vecino', '+573000000002')],
  ]);
  private readonly vehiculos: (VehiculoPropioGuardado & { readonly copropiedadId: string })[] = [];
  tope = 2;

  // ── Alta ──────────────────────────────────────────────────────────────────
  async vocabulario(copropiedadId: string): Promise<VocabularioDeAlta | null> {
    if (copropiedadId !== COP_A && copropiedadId !== COP_B) return null;
    return {
      copropiedadNombre: copropiedadId === COP_A ? 'Copropiedad A' : 'Copropiedad B',
      tipo: 'casas',
      etiquetaVivienda: 'Casa',
      etiquetaAgrupacion: 'Manzana',
    };
  }
  async estado(_copropiedadId: string, usuarioId: string): Promise<EstadoDeAltaGuardado> {
    return { viviendaId: VIVIENDA_DE.get(usuarioId) ?? null, debeDeclararOcupantes: false };
  }
  async buscarVivienda(copropiedadId: string): Promise<readonly ViviendaEncontrada[]> {
    return copropiedadId === COP_A ? [{ id: VIVIENDA_1, activa: true, tieneCuenta: true }] : [];
  }
  async codigosIncorrectosDesde(_c: string, usuarioId: string, desde: Date): Promise<number> {
    return this.bitacora.filter(
      (h) => h.tipo === 'codigo_incorrecto' && h.usuarioId === usuarioId && h.ocurridoEn >= desde,
    ).length;
  }
  async plazasLibres(_c: string, viviendaId: string): Promise<readonly PlazaDeOcupante[]> {
    return (this.plazasDe.get(viviendaId) ?? []).filter((p) => p.usuarioId === null);
  }
  async vincular(_p: VinculoPedido): Promise<VinculoEscrito> {
    return { ok: false, motivo: 'DOCUMENTO_EN_USO' };
  }

  // ── Ocupantes ─────────────────────────────────────────────────────────────
  async plazas(_c: string, viviendaId: string): Promise<readonly PlazaDeOcupante[]> {
    return this.plazasDe.get(viviendaId) ?? [];
  }
  async declaracion(_c: string, viviendaId: string, usuarioId: string) {
    return { esPrimerResidente: VIVIENDA_DE.get(usuarioId) === viviendaId, declarada: true };
  }
  async declarar(): Promise<boolean> {
    return false;
  }
  async anadir(
    _c: string,
    viviendaId: string,
    cantidad: number,
  ): Promise<readonly PlazaDeOcupante[] | null> {
    const actuales = this.plazasDe.get(viviendaId);
    if (actuales === undefined) return null;
    for (let i = 0; i < cantidad; i += 1) {
      actuales.push(plaza(randomUUID(), actuales.length + 1, null, null));
    }
    return actuales;
  }
  async retirar(_c: string, viviendaId: string, plazaId: string): Promise<boolean> {
    const actuales = this.plazasDe.get(viviendaId) ?? [];
    const i = actuales.findIndex((p) => p.id === plazaId);
    if (i < 0) return false;
    actuales.splice(i, 1);
    return true;
  }

  // ── Vehículos propios ─────────────────────────────────────────────────────
  private propiosActivos(ambito: AmbitoDelResidente) {
    return this.vehiculos.filter(
      (v) =>
        v.copropiedadId === ambito.copropiedadId && v.viviendaId === ambito.viviendaId && v.activo,
    );
  }
  async cupo(ambito: AmbitoDelResidente) {
    return { tope: this.tope, ocupados: this.propiosActivos(ambito).length };
  }
  async ocupantes(ambito: AmbitoDelResidente): Promise<readonly string[]> {
    return ambito.viviendaId === VIVIENDA_1
      ? ['40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002']
      : ['40000000-0000-4000-8000-0000000000a1'];
  }
  async registrar(
    ambito: AmbitoDelResidente,
    actorId: string,
    v: VehiculoPropioValido,
  ): Promise<AltaDeVehiculo> {
    if (this.propiosActivos(ambito).length >= this.tope)
      return { ok: false, motivo: 'TOPE_ALCANZADO' };
    if (this.vehiculos.some((x) => x.activo && x.placa === v.placa)) {
      return { ok: false, motivo: 'PLACA_DUPLICADA' };
    }
    const id = randomUUID();
    this.vehiculos.push({
      id,
      copropiedadId: ambito.copropiedadId,
      viviendaId: ambito.viviendaId,
      vivienda: ambito.viviendaId,
      placa: v.placa,
      color: v.color,
      modelo: v.modelo,
      marca: v.marca,
      tipo: v.tipo,
      registradoEn: new Date(0).toISOString(),
      registradoPor: actorId,
      ocupantes: [...v.ocupantes],
      activo: true,
    });
    return { ok: true, id };
  }
  async desactivar(ambito: AmbitoDelResidente, vehiculoId: string): Promise<boolean> {
    const i = this.vehiculos.findIndex(
      (v) => v.id === vehiculoId && v.viviendaId === ambito.viviendaId && v.activo,
    );
    const hallado = this.vehiculos[i];
    if (hallado === undefined) return false;
    this.vehiculos[i] = { ...hallado, activo: false };
    return true;
  }
  async registradosPorResidentes(
    copropiedadId: string,
  ): Promise<readonly VehiculoPropioGuardado[]> {
    return this.vehiculos.filter((v) => v.copropiedadId === copropiedadId);
  }

  // ── Perfil ────────────────────────────────────────────────────────────────
  async perfil(_c: string, usuarioId: string): Promise<PerfilGuardado | null> {
    return this.perfiles.get(usuarioId) ?? null;
  }
  async guardar(
    _c: string,
    usuarioId: string,
    p: PerfilValido,
  ): Promise<'guardado' | 'DOCUMENTO_EN_USO' | 'SIN_VINCULO'> {
    const actual = this.perfiles.get(usuarioId);
    if (actual === undefined) return 'SIN_VINCULO';
    this.perfiles.set(usuarioId, {
      ...actual,
      ...p,
      nombreCompleto: `${p.nombres} ${p.apellidos}`,
    });
    return 'guardado';
  }

  // ── Bitácora y cuentas ────────────────────────────────────────────────────
  async anotar(h: HechoDeResidente): Promise<void> {
    this.bitacora.push(h);
  }
  async listar(copropiedadId: string): Promise<readonly CuentaDeResidente[]> {
    return copropiedadId === COP_A
      ? [
          {
            usuarioId: USUARIO_R1,
            usuario: 'titular.uno',
            nombre: 'Titular Uno',
            vivienda: 'B · 42',
            activa: true,
            debeCambiarContrasena: false,
            creadaEn: new Date(0).toISOString(),
          },
        ]
      : [];
  }
}
