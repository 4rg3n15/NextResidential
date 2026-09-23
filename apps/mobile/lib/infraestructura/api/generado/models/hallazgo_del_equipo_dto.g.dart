// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hallazgo_del_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HallazgoDelEquipoDto _$HallazgoDelEquipoDtoFromJson(
  Map<String, dynamic> json,
) => HallazgoDelEquipoDto(
  campo: json['campo'] as String,
  estado: HallazgoDelEquipoDtoEstado.fromJson(json['estado'] as String),
  valorLeido: json['valorLeido'] as String?,
  valorCorrecto: json['valorCorrecto'] as String?,
  detalle: json['detalle'] as String,
  correccion: json['correccion'] == null
      ? null
      : HallazgoDelEquipoDtoCorreccion.fromJson(json['correccion'] as String),
);

Map<String, dynamic> _$HallazgoDelEquipoDtoToJson(
  HallazgoDelEquipoDto instance,
) => <String, dynamic>{
  'campo': instance.campo,
  'estado': instance.estado,
  'valorLeido': instance.valorLeido,
  'valorCorrecto': instance.valorCorrecto,
  'detalle': instance.detalle,
  'correccion': instance.correccion,
};
