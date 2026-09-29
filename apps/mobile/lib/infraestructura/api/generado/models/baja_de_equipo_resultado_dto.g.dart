// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'baja_de_equipo_resultado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BajaDeEquipoResultadoDto _$BajaDeEquipoResultadoDtoFromJson(
  Map<String, dynamic> json,
) => BajaDeEquipoResultadoDto(
  id: json['id'] as String,
  nombre: json['nombre'] as String,
  tipo: BajaDeEquipoResultadoDtoTipo.fromJson(json['tipo'] as String),
  modelo: json['modelo'] as String?,
  firmware: json['firmware'] as String?,
  canalBarrera: json['canalBarrera'] as num?,
  numeroDePuerta: json['numeroDePuerta'] as num?,
  canalDeAudio: json['canalDeAudio'] as num?,
  fabricante: json['fabricante'] as String?,
  modoDeTerminal: json['modoDeTerminal'] == null
      ? null
      : BajaDeEquipoResultadoDtoModoDeTerminal.fromJson(
          json['modoDeTerminal'] as String,
        ),
  canalDeAudioHabilitado: json['canalDeAudioHabilitado'] as bool,
  canalDeVideo: json['canalDeVideo'] as String?,
  zonaId: json['zonaId'] as String?,
  capacidades: json['capacidades'] == null
      ? null
      : CapacidadesDeEquipoDto.fromJson(
          json['capacidades'] as Map<String, dynamic>,
        ),
  verificacion: BajaDeEquipoResultadoDtoVerificacion.fromJson(
    json['verificacion'] as String,
  ),
  verificadoEn: json['verificadoEn'] as String?,
  motivoNoVerificado: json['motivoNoVerificado'] as String?,
  estado: BajaDeEquipoResultadoDtoEstado.fromJson(json['estado'] as String),
  atestacion: json['atestacion'] == null
      ? null
      : AtestacionDeEquipoDto.fromJson(
          json['atestacion'] as Map<String, dynamic>,
        ),
  estadoDelEquipo: EstadoDelEquipoDto.fromJson(
    json['estadoDelEquipo'] as Map<String, dynamic>,
  ),
  sondeadoEn: json['sondeadoEn'] == null
      ? null
      : DateTime.parse(json['sondeadoEn'] as String),
  identidadLeidaEn: json['identidadLeidaEn'] == null
      ? null
      : DateTime.parse(json['identidadLeidaEn'] as String),
  plantillasRetiradas: json['plantillasRetiradas'] as num,
  plantillasPendientes: json['plantillasPendientes'] as num,
);

Map<String, dynamic> _$BajaDeEquipoResultadoDtoToJson(
  BajaDeEquipoResultadoDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'tipo': instance.tipo,
  'modelo': instance.modelo,
  'firmware': instance.firmware,
  'canalBarrera': instance.canalBarrera,
  'numeroDePuerta': instance.numeroDePuerta,
  'canalDeAudio': instance.canalDeAudio,
  'fabricante': instance.fabricante,
  'modoDeTerminal': instance.modoDeTerminal,
  'canalDeAudioHabilitado': instance.canalDeAudioHabilitado,
  'canalDeVideo': instance.canalDeVideo,
  'zonaId': instance.zonaId,
  'capacidades': instance.capacidades,
  'verificacion': instance.verificacion,
  'verificadoEn': instance.verificadoEn,
  'motivoNoVerificado': instance.motivoNoVerificado,
  'estado': instance.estado,
  'atestacion': instance.atestacion,
  'estadoDelEquipo': instance.estadoDelEquipo,
  'sondeadoEn': instance.sondeadoEn?.toIso8601String(),
  'identidadLeidaEn': instance.identidadLeidaEn?.toIso8601String(),
  'plantillasRetiradas': instance.plantillasRetiradas,
  'plantillasPendientes': instance.plantillasPendientes,
};
