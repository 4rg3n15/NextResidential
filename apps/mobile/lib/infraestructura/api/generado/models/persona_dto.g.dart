// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'persona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PersonaDto _$PersonaDtoFromJson(Map<String, dynamic> json) => PersonaDto(
  id: json['id'] as String,
  nombreCompleto: json['nombreCompleto'] as String,
  tipoDocumento: PersonaDtoTipoDocumento.fromJson(
    json['tipoDocumento'] as String,
  ),
  numeroDocumento: json['numeroDocumento'] as String,
  esResidente: json['esResidente'] as bool,
  viviendaIdentificador: json['viviendaIdentificador'] as String?,
);

Map<String, dynamic> _$PersonaDtoToJson(PersonaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombreCompleto': instance.nombreCompleto,
      'tipoDocumento': instance.tipoDocumento,
      'numeroDocumento': instance.numeroDocumento,
      'esResidente': instance.esResidente,
      'viviendaIdentificador': instance.viviendaIdentificador,
    };
