// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capturar_rostro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapturarRostroDto _$CapturarRostroDtoFromJson(Map<String, dynamic> json) =>
    CapturarRostroDto(
      titularId: json['titularId'] as String,
      medidas: MedidasDto.fromJson(json['medidas'] as Map<String, dynamic>),
      vector: json['vector'] as String,
      versionPolitica: json['versionPolitica'] as String,
      canal: CapturarRostroDtoCanal.fromJson(json['canal'] as String),
      suprimirEn: json['suprimirEn'] as String,
      autorizacionId: json['autorizacionId'] as String?,
    );

Map<String, dynamic> _$CapturarRostroDtoToJson(CapturarRostroDto instance) =>
    <String, dynamic>{
      'titularId': instance.titularId,
      'autorizacionId': instance.autorizacionId,
      'medidas': instance.medidas,
      'vector': instance.vector,
      'versionPolitica': instance.versionPolitica,
      'canal': instance.canal,
      'suprimirEn': instance.suprimirEn,
    };
