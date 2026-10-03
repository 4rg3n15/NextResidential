// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billete_del_flujo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BilleteDelFlujoDto _$BilleteDelFlujoDtoFromJson(Map<String, dynamic> json) =>
    BilleteDelFlujoDto(
      billete: json['billete'] as String,
      caducaEn: DateTime.parse(json['caducaEn'] as String),
      ruta: json['ruta'] as String,
    );

Map<String, dynamic> _$BilleteDelFlujoDtoToJson(BilleteDelFlujoDto instance) =>
    <String, dynamic>{
      'billete': instance.billete,
      'caducaEn': instance.caducaEn.toIso8601String(),
      'ruta': instance.ruta,
    };
