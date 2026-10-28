// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'descarga_de_respaldo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DescargaDeRespaldoDto _$DescargaDeRespaldoDtoFromJson(
  Map<String, dynamic> json,
) => DescargaDeRespaldoDto(
  url: json['url'] as String,
  segundosDeVida: json['segundosDeVida'] as num,
);

Map<String, dynamic> _$DescargaDeRespaldoDtoToJson(
  DescargaDeRespaldoDto instance,
) => <String, dynamic>{
  'url': instance.url,
  'segundosDeVida': instance.segundosDeVida,
};
