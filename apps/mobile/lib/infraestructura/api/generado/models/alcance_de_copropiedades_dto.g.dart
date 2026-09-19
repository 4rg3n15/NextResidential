// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alcance_de_copropiedades_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AlcanceDeCopropiedadesDto _$AlcanceDeCopropiedadesDtoFromJson(
  Map<String, dynamic> json,
) => AlcanceDeCopropiedadesDto(
  copropiedades: (json['copropiedades'] as List<dynamic>)
      .map((e) => CopropiedadResumenDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  alcanceGlobal: json['alcanceGlobal'] as bool,
);

Map<String, dynamic> _$AlcanceDeCopropiedadesDtoToJson(
  AlcanceDeCopropiedadesDto instance,
) => <String, dynamic>{
  'copropiedades': instance.copropiedades,
  'alcanceGlobal': instance.alcanceGlobal,
};
