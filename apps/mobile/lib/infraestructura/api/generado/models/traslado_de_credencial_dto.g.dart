// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'traslado_de_credencial_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrasladoDeCredencialDto _$TrasladoDeCredencialDtoFromJson(
  Map<String, dynamic> json,
) => TrasladoDeCredencialDto(
  dispositivoId: json['dispositivoId'] as String,
  trasladada: json['trasladada'] as bool,
  motivo: json['motivo'] as String,
);

Map<String, dynamic> _$TrasladoDeCredencialDtoToJson(
  TrasladoDeCredencialDto instance,
) => <String, dynamic>{
  'dispositivoId': instance.dispositivoId,
  'trasladada': instance.trasladada,
  'motivo': instance.motivo,
};
