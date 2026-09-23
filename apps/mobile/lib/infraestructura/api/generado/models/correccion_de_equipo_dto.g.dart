// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'correccion_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CorreccionDeEquipoDto _$CorreccionDeEquipoDtoFromJson(
  Map<String, dynamic> json,
) => CorreccionDeEquipoDto(
  correccion: CorreccionDeEquipoDtoCorreccion.fromJson(
    json['correccion'] as String,
  ),
  motivo: json['motivo'] as String,
);

Map<String, dynamic> _$CorreccionDeEquipoDtoToJson(
  CorreccionDeEquipoDto instance,
) => <String, dynamic>{
  'correccion': instance.correccion,
  'motivo': instance.motivo,
};
