// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'preferencias_de_atencion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PreferenciasDeAtencionDto _$PreferenciasDeAtencionDtoFromJson(
  Map<String, dynamic> json,
) => PreferenciasDeAtencionDto(
  llamada: PreferenciaDeDisparadorDto.fromJson(
    json['llamada'] as Map<String, dynamic>,
  ),
  rostro: PreferenciaDeDisparadorDto.fromJson(
    json['rostro'] as Map<String, dynamic>,
  ),
  placa: PreferenciaDeDisparadorDto.fromJson(
    json['placa'] as Map<String, dynamic>,
  ),
  listaNegra: PreferenciaDeDisparadorDto.fromJson(
    json['lista_negra'] as Map<String, dynamic>,
  ),
  dudoso: PreferenciaDeDisparadorDto.fromJson(
    json['dudoso'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$PreferenciasDeAtencionDtoToJson(
  PreferenciasDeAtencionDto instance,
) => <String, dynamic>{
  'llamada': instance.llamada,
  'rostro': instance.rostro,
  'placa': instance.placa,
  'lista_negra': instance.listaNegra,
  'dudoso': instance.dudoso,
};
