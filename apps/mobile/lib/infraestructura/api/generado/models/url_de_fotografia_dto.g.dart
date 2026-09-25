// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'url_de_fotografia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UrlDeFotografiaDto _$UrlDeFotografiaDtoFromJson(Map<String, dynamic> json) =>
    UrlDeFotografiaDto(
      url: json['url'] as String,
      expiraEnSegundos: json['expiraEnSegundos'] as num,
    );

Map<String, dynamic> _$UrlDeFotografiaDtoToJson(UrlDeFotografiaDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'expiraEnSegundos': instance.expiraEnSegundos,
    };
