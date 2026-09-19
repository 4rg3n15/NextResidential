// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'historial_de_ordenes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HistorialDeOrdenesDto _$HistorialDeOrdenesDtoFromJson(
  Map<String, dynamic> json,
) => HistorialDeOrdenesDto(
  ordenes: (json['ordenes'] as List<dynamic>)
      .map((e) => OrdenEjecutadaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$HistorialDeOrdenesDtoToJson(
  HistorialDeOrdenesDto instance,
) => <String, dynamic>{'ordenes': instance.ordenes};
