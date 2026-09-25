// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_por_terminal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoPorTerminalDto _$ResultadoPorTerminalDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoPorTerminalDto(
  dispositivoId: json['dispositivoId'] as String,
  nombre: json['nombre'] as String,
  sincronizada: json['sincronizada'] as bool,
  detalle: json['detalle'] as String,
);

Map<String, dynamic> _$ResultadoPorTerminalDtoToJson(
  ResultadoPorTerminalDto instance,
) => <String, dynamic>{
  'dispositivoId': instance.dispositivoId,
  'nombre': instance.nombre,
  'sincronizada': instance.sincronizada,
  'detalle': instance.detalle,
};
