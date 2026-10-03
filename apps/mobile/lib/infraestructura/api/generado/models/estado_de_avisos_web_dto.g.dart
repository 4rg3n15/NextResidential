// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_avisos_web_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeAvisosWebDto _$EstadoDeAvisosWebDtoFromJson(
  Map<String, dynamic> json,
) => EstadoDeAvisosWebDto(
  disponible: json['disponible'] as bool,
  clavePublica: json['clavePublica'] as String?,
);

Map<String, dynamic> _$EstadoDeAvisosWebDtoToJson(
  EstadoDeAvisosWebDto instance,
) => <String, dynamic>{
  'disponible': instance.disponible,
  'clavePublica': instance.clavePublica,
};
