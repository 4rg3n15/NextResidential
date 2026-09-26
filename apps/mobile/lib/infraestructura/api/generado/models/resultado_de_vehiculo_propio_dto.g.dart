// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_vehiculo_propio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeVehiculoPropioDto _$ResultadoDeVehiculoPropioDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeVehiculoPropioDto(
  registrado: json['registrado'] as bool,
  id: json['id'] as String?,
  motivo: json['motivo'] == null
      ? null
      : ResultadoDeVehiculoPropioDtoMotivo.fromJson(json['motivo'] as String),
  explicacion: json['explicacion'] as String?,
);

Map<String, dynamic> _$ResultadoDeVehiculoPropioDtoToJson(
  ResultadoDeVehiculoPropioDto instance,
) => <String, dynamic>{
  'registrado': instance.registrado,
  'id': instance.id,
  'motivo': instance.motivo,
  'explicacion': instance.explicacion,
};
