// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conteos_del_padron_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConteosDelPadronDto _$ConteosDelPadronDtoFromJson(Map<String, dynamic> json) =>
    ConteosDelPadronDto(
      residentesActivos: json['residentesActivos'] as num,
      residentesAltaEnVentana: json['residentesAltaEnVentana'] as num,
      vehiculosActivos: json['vehiculosActivos'] as num,
      vehiculosAltaEnVentana: json['vehiculosAltaEnVentana'] as num,
    );

Map<String, dynamic> _$ConteosDelPadronDtoToJson(
  ConteosDelPadronDto instance,
) => <String, dynamic>{
  'residentesActivos': instance.residentesActivos,
  'residentesAltaEnVentana': instance.residentesAltaEnVentana,
  'vehiculosActivos': instance.vehiculosActivos,
  'vehiculosAltaEnVentana': instance.vehiculosAltaEnVentana,
};
