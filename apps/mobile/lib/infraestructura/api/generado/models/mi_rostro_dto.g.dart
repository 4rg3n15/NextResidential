// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_rostro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiRostroDto _$MiRostroDtoFromJson(Map<String, dynamic> json) => MiRostroDto(
  contenidoBase64: json['contenidoBase64'] as String,
  tipoMime: MiRostroDtoTipoMime.fromJson(json['tipoMime'] as String),
  medidas: MedidasDeFotoDto.fromJson(json['medidas'] as Map<String, dynamic>),
  versionPolitica: json['versionPolitica'] as String,
  aceptaPolitica: json['aceptaPolitica'] as bool,
);

Map<String, dynamic> _$MiRostroDtoToJson(MiRostroDto instance) =>
    <String, dynamic>{
      'contenidoBase64': instance.contenidoBase64,
      'tipoMime': instance.tipoMime,
      'medidas': instance.medidas,
      'versionPolitica': instance.versionPolitica,
      'aceptaPolitica': instance.aceptaPolitica,
    };
