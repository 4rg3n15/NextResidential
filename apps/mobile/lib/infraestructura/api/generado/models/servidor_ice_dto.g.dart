// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'servidor_ice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ServidorIceDto _$ServidorIceDtoFromJson(Map<String, dynamic> json) =>
    ServidorIceDto(
      urls: (json['urls'] as List<dynamic>).map((e) => e as String).toList(),
      username: json['username'] as String?,
      credential: json['credential'] as String?,
    );

Map<String, dynamic> _$ServidorIceDtoToJson(ServidorIceDto instance) =>
    <String, dynamic>{
      'urls': instance.urls,
      'username': instance.username,
      'credential': instance.credential,
    };
