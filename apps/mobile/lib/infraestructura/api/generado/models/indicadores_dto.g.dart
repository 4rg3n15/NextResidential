// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'indicadores_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IndicadoresDto _$IndicadoresDtoFromJson(
  Map<String, dynamic> json,
) => IndicadoresDto(
  padron: ConteosDelPadronDto.fromJson(json['padron'] as Map<String, dynamic>),
  visitantes: ConteosDeVisitantesDto.fromJson(
    json['visitantes'] as Map<String, dynamic>,
  ),
  alertas: ConteosDeAlertasDto.fromJson(
    json['alertas'] as Map<String, dynamic>,
  ),
  ventana: VentanaDelDiaDto.fromJson(json['ventana'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IndicadoresDtoToJson(IndicadoresDto instance) =>
    <String, dynamic>{
      'padron': instance.padron,
      'visitantes': instance.visitantes,
      'alertas': instance.alertas,
      'ventana': instance.ventana,
    };
