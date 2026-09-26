// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vehiculo_de_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VehiculoDeResidenteDto _$VehiculoDeResidenteDtoFromJson(
  Map<String, dynamic> json,
) => VehiculoDeResidenteDto(
  id: json['id'] as String,
  viviendaId: json['viviendaId'] as String,
  vivienda: json['vivienda'] as String,
  placa: json['placa'] as String,
  color: json['color'] as String?,
  modelo: json['modelo'] as String?,
  marca: json['marca'] as String?,
  tipo: json['tipo'] as String,
  registradoEn: json['registradoEn'] as String,
  registradoPor: json['registradoPor'] as String?,
  ocupantes: (json['ocupantes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  activo: json['activo'] as bool,
);

Map<String, dynamic> _$VehiculoDeResidenteDtoToJson(
  VehiculoDeResidenteDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'viviendaId': instance.viviendaId,
  'vivienda': instance.vivienda,
  'placa': instance.placa,
  'color': instance.color,
  'modelo': instance.modelo,
  'marca': instance.marca,
  'tipo': instance.tipo,
  'registradoEn': instance.registradoEn,
  'registradoPor': instance.registradoPor,
  'ocupantes': instance.ocupantes,
  'activo': instance.activo,
};
