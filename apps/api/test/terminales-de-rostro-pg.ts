import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { FaceTemplateProvider } from '@ncr/domain-core';
import { capacidadesDescubiertas } from '@ncr/providers';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { bancoDelHogar } from './banco-del-hogar-pg';
import type { BancoDelHogar } from './banco-del-hogar-pg';

/**
 * 15-X · el banco del hogar con terminales de rostros ESPIADAS, para las
 * pruebas del rostro propio (D2) y del de un menor (D3) contra la base: qué
 * plantilla recibió cada equipo y cuál se le retiró. Los equipos se dan de
 * alta de verdad en el registro (con biblioteca de rostros); lo que se espía es
 * el proveedor, el único punto que tocaría hardware.
 */
export class TerminalesEspia implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  async sincronizar(dispositivoId: string, plantillaId: string): Promise<void> {
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

export interface BancoConTerminales {
  readonly banco: BancoDelHogar;
  readonly espia: TerminalesEspia;
  /** Da de alta en la copropiedad un equipo con biblioteca de rostros por nombre. */
  readonly terminales: (copropiedadId: string, nombres: readonly string[]) => Promise<string[]>;
}

export const bancoConTerminales = (motivo: string): BancoConTerminales => {
  const espia = new TerminalesEspia();
  let equipos: RepositorioDeEquiposPg | undefined;
  const banco = bancoDelHogar(motivo, {
    montar: async (pool) => {
      equipos = new RepositorioDeEquiposPg(
        pool,
        'llave-de-equipos-solo-para-pruebas-32+',
        'env:EQUIPOS_LLAVE',
      );
      return { repositorio: equipos };
    },
    sustituir: (b) => b.overrideProvider(FACE_TEMPLATE_PROVIDER).useValue(espia),
  });
  const terminales = async (copropiedadId: string, nombres: readonly string[]) => {
    const ctx = {
      usuarioId: '00000000-0000-4000-8000-000000000001',
      rol: 'superadministrador' as const,
      copropiedadId,
      copropiedadesAtendidas: [],
      mfaVerificado: true,
    };
    const ids: string[] = [];
    for (const nombre of nombres) {
      const e = await (equipos as RepositorioDeEquiposPg).crear(
        ctx,
        copropiedadId,
        {
          nombre: `${nombre} ${banco.sufijo}`,
          tipo: 'terminal_facial',
          host: `${nombre.replace(' ', '-').toLowerCase()}-${banco.sufijo}.invalid`,
          puerto: 80,
          protocolo: 'http',
          usuario: 'servicio',
          secreto: 'clave-de-pruebas-1',
        },
        {
          clase: 'alcanzado',
          detalle: 'responde',
          modelo: 'M',
          firmware: 'V0',
          latenciaMs: 1,
          verificado: true,
          capacidades: capacidadesDescubiertas({
            bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
          }),
        },
      );
      ids.push(e.id);
    }
    return ids;
  };
  return { banco, espia, terminales };
};
