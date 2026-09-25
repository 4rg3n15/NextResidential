import type { HechoConNombres } from '../aplicacion/supervision';
import type { FichaDelPortero } from '../aplicacion/porteros';
import type { TurnoRegistrado } from '../aplicacion/puertos';
import { cruzaMedianoche } from '../dominio/turno';
import type { HechoDeBitacoraDto, PorteroDto, TurnoDto } from './dtos';

export const aTurnoDto = (t: TurnoRegistrado): TurnoDto => ({
  id: t.id,
  porteroId: t.porteroId,
  porteria: t.porteria,
  dia: t.dia,
  horaInicio: t.horaInicio,
  horaFin: t.horaFin,
  inicio: t.franja.inicio.toISOString(),
  fin: t.franja.fin.toISOString(),
  cruzaMedianoche: cruzaMedianoche(t.horaInicio, t.horaFin),
  tipo: t.tipo,
  motivo: t.motivo,
});

export const aPorteroDto = (f: FichaDelPortero): PorteroDto => ({
  usuarioId: f.cuenta.usuarioId,
  usuario: f.cuenta.usuario,
  nombre: f.cuenta.nombre,
  telefono: f.cuenta.telefono,
  correoContacto: f.perfil.correoContacto,
  porteria: f.perfil.porteria,
  sectores: [...f.perfil.sectores],
  debeCambiarContrasena: f.cuenta.debeCambiarContrasena,
  turnoVigente: f.turnoVigente === null ? null : aTurnoDto(f.turnoVigente),
  sesionAbierta:
    f.sesionAbierta === null || f.sesionAbierta.estado === 'cerrada'
      ? null
      : {
          estado: f.sesionAbierta.estado,
          iniciadaEn: f.sesionAbierta.iniciadaEn.toISOString(),
          patrullajeDesde: f.sesionAbierta.patrullajeDesde?.toISOString() ?? null,
          origen: f.sesionAbierta.origenDeclarado,
        },
});

export const aHechoDto = (h: HechoConNombres): HechoDeBitacoraDto => ({
  id: h.id,
  tipo: h.tipo,
  ocurridoEn: h.ocurridoEn.toISOString(),
  usuarioId: h.usuarioId,
  nombreUsuario: h.nombreUsuario,
  actorId: h.actorId,
  nombreActor: h.nombreActor,
  turnoId: h.turnoId ?? null,
  duracionSegundos: h.duracionSegundos ?? null,
  origenIp: h.origen?.ip ?? null,
  origenDeclarado: h.origen?.declarado ?? null,
  agente: h.origen?.agente ?? null,
  detalle: h.detalle ?? null,
});
