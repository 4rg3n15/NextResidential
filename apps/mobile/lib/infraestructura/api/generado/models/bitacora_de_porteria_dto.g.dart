// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bitacora_de_porteria_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BitacoraDePorteriaDto _$BitacoraDePorteriaDtoFromJson(
  Map<String, dynamic> json,
) => BitacoraDePorteriaDto(
  hechos: (json['hechos'] as List<dynamic>)
      .map((e) => HechoDeBitacoraDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$BitacoraDePorteriaDtoToJson(
  BitacoraDePorteriaDto instance,
) => <String, dynamic>{'hechos': instance.hechos};
