// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fotografia_de_visitante_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FotografiaDeVisitanteDto _$FotografiaDeVisitanteDtoFromJson(
  Map<String, dynamic> json,
) => FotografiaDeVisitanteDto(
  tipoMime: FotografiaDeVisitanteDtoTipoMime.fromJson(
    json['tipoMime'] as String,
  ),
  contenidoBase64: json['contenidoBase64'] as String,
);

Map<String, dynamic> _$FotografiaDeVisitanteDtoToJson(
  FotografiaDeVisitanteDto instance,
) => <String, dynamic>{
  'tipoMime': instance.tipoMime,
  'contenidoBase64': instance.contenidoBase64,
};
