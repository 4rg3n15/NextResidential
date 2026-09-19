// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'copropiedad_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CopropiedadDto _$CopropiedadDtoFromJson(Map<String, dynamic> json) =>
    CopropiedadDto(
      id: json['id'] as String,
      alcance: CopropiedadDtoAlcance.fromJson(json['alcance'] as String),
    );

Map<String, dynamic> _$CopropiedadDtoToJson(CopropiedadDto instance) =>
    <String, dynamic>{'id': instance.id, 'alcance': instance.alcance};
