import type { PlantillaBiometrica } from '@ncr/domain-core';
import type {
  AltaDeRostro,
  EstadoEnEquipo,
  LecturaDeRostros,
  PlantillaViva,
  ReemplazoDeRostro,
  ResultadoDeReemplazo,
} from '../aplicacion/puertos-del-rostro';
import type {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from './repositorios-en-memoria';

/**
 * 15-X · el rostro del residente con la biometría EN MEMORIA (la suite sin
 * base): la misma lectura y el mismo alta optimista que en PostgreSQL, sobre
 * los dobles de plantillas y consentimientos. Lo que los índices únicos hacen
 * en la base —de dos primeras capturas, la segunda choca con el consentimiento
 * o la plantilla de la primera— lo hace aquí la comprobación previa, antes de
 * guardar nada. La anterior sigue viva hasta que `SuprimirYRetirarYa` la
 * suprime, justo después.
 */
const VIVAS = new Set(['pendiente_consentimiento', 'pendiente_sincronizacion', 'activa']);
const DIA_MS = 24 * 3600 * 1000;

export class RostrosEnMemoria implements LecturaDeRostros, ReemplazoDeRostro {
  private readonly capturas: { cop: string; usuarioId: string; en: Date }[] = [];

  constructor(
    private readonly plantillas: RepositorioPlantillasEnMemoria,
    private readonly consentimientos: RepositorioConsentimientosEnMemoria,
  ) {}

  private async vivas(cop: string, personaId: string): Promise<PlantillaBiometrica[]> {
    return (await this.plantillas.deTitular(cop, personaId))
      .filter((p) => p.autorizacionId === null && VIVAS.has(p.estado))
      .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
  }

  async vivaDe(cop: string, personaId: string): Promise<PlantillaViva | null> {
    const [p] = await this.vivas(cop, personaId);
    return p === undefined
      ? null
      : {
          plantillaId: p.id,
          calidad: p.calidad.valor,
          registradoEn: p.creadoEn,
          venceEn: p.suprimirEn,
        };
  }

  async enEquipos(_cop: string, plantillaId: string) {
    const r: { dispositivoId: string; estado: EstadoEnEquipo }[] = [];
    for (const d of this.plantillas.sincronizaciones.get(plantillaId) ?? []) {
      r.push({ dispositivoId: d, estado: 'sincronizada' });
    }
    for (const clave of this.plantillas.fallos.keys()) {
      const [p, d] = clave.split('/');
      if (p === plantillaId && d !== undefined) r.push({ dispositivoId: d, estado: 'fallida' });
    }
    return r;
  }

  async retiradasPendientes(cop: string, personaId: string): Promise<number> {
    return (await this.plantillas.deTitular(cop, personaId))
      .filter((p) => p.autorizacionId === null && p.suprimida)
      .reduce((n, p) => n + (this.plantillas.sincronizaciones.get(p.id)?.size ?? 0), 0);
  }

  async capturasRecientes(cop: string, usuarioId: string, ahora: Date): Promise<readonly Date[]> {
    return this.capturas
      .filter(
        (c) =>
          c.cop === cop && c.usuarioId === usuarioId && c.en.getTime() > ahora.getTime() - DIA_MS,
      )
      .map((c) => c.en);
  }

  async reemplazar(alta: AltaDeRostro): Promise<ResultadoDeReemplazo> {
    const { consentimiento, nueva, anteriorLeida, actorId, ahora } = alta;
    const vivas = await this.vivas(nueva.copropiedadId, nueva.titularId);
    const sigue =
      anteriorLeida === null ? vivas.length === 0 : vivas.some((p) => p.id === anteriorLeida);
    // `consent_vigente_uk`: uno vigente por titular, y si es otro, ganó otro registro.
    const vigente = await this.consentimientos.vigenteDe(nueva.copropiedadId, nueva.titularId);
    if (!sigue || (vigente !== null && vigente.id !== consentimiento.id)) return { ok: false };
    await this.consentimientos.guardar(consentimiento);
    this.plantillas.declarar(nueva);
    this.capturas.push({ cop: nueva.copropiedadId, usuarioId: actorId, en: ahora });
    return { ok: true, reemplazada: anteriorLeida };
  }
}
