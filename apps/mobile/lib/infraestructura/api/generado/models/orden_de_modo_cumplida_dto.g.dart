// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orden_de_modo_cumplida_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrdenDeModoCumplidaDto _$OrdenDeModoCumplidaDtoFromJson(
  Map<String, dynamic> json,
) => OrdenDeModoCumplidaDto(
  id: json['id'] as String,
  resultado: OrdenDeModoCumplidaDtoResultado.fromJson(
    json['resultado'] as String,
  ),
  detalle: json['detalle'] as String?,
  revierteEn: json['revierteEn'] == null
      ? null
      : DateTime.parse(json['revierteEn'] as String),
);

Map<String, dynamic> _$OrdenDeModoCumplidaDtoToJson(
  OrdenDeModoCumplidaDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'resultado': instance.resultado,
  'detalle': instance.detalle,
  'revierteEn': instance.revierteEn?.toIso8601String(),
};
