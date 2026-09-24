// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EquipoDto _$EquipoDtoFromJson(Map<String, dynamic> json) => EquipoDto(
  id: json['id'] as String,
  nombre: json['nombre'] as String,
  tipo: EquipoDtoTipo.fromJson(json['tipo'] as String),
  modelo: json['modelo'] as String?,
  firmware: json['firmware'] as String?,
  canalBarrera: json['canalBarrera'] as num?,
  numeroDePuerta: json['numeroDePuerta'] as num?,
  canalDeAudio: json['canalDeAudio'] as num?,
  fabricante: json['fabricante'] as String?,
  modoDeTerminal: json['modoDeTerminal'] == null
      ? null
      : EquipoDtoModoDeTerminal.fromJson(json['modoDeTerminal'] as String),
  canalDeAudioHabilitado: json['canalDeAudioHabilitado'] as bool,
  capacidades: json['capacidades'] == null
      ? null
      : CapacidadesDeEquipoDto.fromJson(
          json['capacidades'] as Map<String, dynamic>,
        ),
  verificacion: EquipoDtoVerificacion.fromJson(json['verificacion'] as String),
  verificadoEn: json['verificadoEn'] as String?,
  motivoNoVerificado: json['motivoNoVerificado'] as String?,
  estado: EquipoDtoEstado.fromJson(json['estado'] as String),
);

Map<String, dynamic> _$EquipoDtoToJson(EquipoDto instance) => <String, dynamic>{
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
  'capacidades': instance.capacidades,
  'verificacion': instance.verificacion,
  'verificadoEn': instance.verificadoEn,
  'motivoNoVerificado': instance.motivoNoVerificado,
  'estado': instance.estado,
};
