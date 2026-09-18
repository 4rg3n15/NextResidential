// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_dispositivos_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeDispositivosDto _$EstadoDeDispositivosDtoFromJson(
  Map<String, dynamic> json,
) => EstadoDeDispositivosDto(
  dispositivos: (json['dispositivos'] as List<dynamic>)
      .map((e) => DispositivoDelTableroDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  saludables: json['saludables'] as num,
  degradados: json['degradados'] as num,
  caidos: json['caidos'] as num,
);

Map<String, dynamic> _$EstadoDeDispositivosDtoToJson(
  EstadoDeDispositivosDto instance,
) => <String, dynamic>{
  'dispositivos': instance.dispositivos,
  'saludables': instance.saludables,
  'degradados': instance.degradados,
  'caidos': instance.caidos,
};
