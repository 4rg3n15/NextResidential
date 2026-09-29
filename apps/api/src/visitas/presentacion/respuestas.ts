import type { FotoEnEquipo, VisitaListada } from '../aplicacion/puertos';
import type { ResultadoDeVisita } from '../aplicacion/generar-visita';
import { confirmacionDePlaca } from '../aplicacion/confirmacion-de-placa';
import type { FotoEnEquipoDto, VisitaDto, VisitaGeneradaDto } from './dtos';

/** El agregado nunca sale crudo: DTO y mapeador (§2.2). */
export const aVisita = (v: VisitaListada): VisitaDto => ({
  autorizacionId: v.autorizacionId,
  visitante: v.visitante,
  documento: v.documento,
  viviendaId: v.viviendaId,
  vivienda: v.vivienda,
  desde: v.desde.toISOString(),
  hasta: v.hasta.toISOString(),
  estado: v.estado,
  placa: v.placa,
  generadaPor: v.generadaPor,
  generadaEn: v.generadaEn.toISOString(),
  anuladaEn: v.anuladaEn?.toISOString() ?? null,
  motivoAnulacion: v.motivoAnulacion,
  tieneFoto: v.tieneFoto,
  casillaDeclaradaPor: v.casillaDeclaradaPor,
  casillaEn: v.casillaEn?.toISOString() ?? null,
  plantillaId: v.plantillaId,
  equiposSincronizados: v.equiposSincronizados,
  equiposFallidos: v.equiposFallidos,
  confirmacionDePlaca: confirmacionDePlaca({
    placa: v.placa,
    visitante: v.visitante,
    desde: v.desde,
    hasta: v.hasta,
  }),
});

export const aFotoEnEquipo = (e: FotoEnEquipo): FotoEnEquipoDto => ({
  dispositivoId: e.dispositivoId,
  equipo: e.equipo,
  estado: e.estado,
  detalle: e.detalle,
  intentos: e.intentos,
  actualizadoEn: e.actualizadoEn.toISOString(),
});

export const aGenerada = (r: ResultadoDeVisita): VisitaGeneradaDto => {
  if (!r.generada) {
    return {
      generada: false,
      autorizacionId: null,
      motivosDeFoto: [...r.motivosDeFoto],
      equipos: 0,
      sincronizadas: 0,
      fallidas: 0,
      porEquipo: [],
      avisoDeSincronizacion: null,
      confirmacionDePlaca: null,
    };
  }
  const s = r.sincronizacion;
  return {
    generada: true,
    autorizacionId: r.autorizacionId,
    motivosDeFoto: [],
    equipos: s?.terminales ?? 0,
    sincronizadas: s?.sincronizadas ?? 0,
    fallidas: s?.fallidas ?? 0,
    porEquipo: (s?.porTerminal ?? []).map((t) => ({
      dispositivoId: t.dispositivoId,
      nombre: t.nombre,
      sincronizada: t.sincronizada,
      detalle: t.detalle,
    })),
    avisoDeSincronizacion: r.avisoDeSincronizacion,
    confirmacionDePlaca: r.confirmacionDePlaca,
  };
};
