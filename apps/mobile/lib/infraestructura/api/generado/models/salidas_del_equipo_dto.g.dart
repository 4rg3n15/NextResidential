// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'salidas_del_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SalidasDelEquipoDto _$SalidasDelEquipoDtoFromJson(Map<String, dynamic> json) =>
    SalidasDelEquipoDto(
      arbol: (json['arbol'] as List<dynamic>)
          .map((e) => NodoDeSalidasDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      motivoSinArbol: json['motivoSinArbol'] as String?,
      puntos: (json['puntos'] as List<dynamic>)
          .map((e) => PuntoDeAccesoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SalidasDelEquipoDtoToJson(
  SalidasDelEquipoDto instance,
) => <String, dynamic>{
  'arbol': instance.arbol,
  'motivoSinArbol': instance.motivoSinArbol,
  'puntos': instance.puntos,
};
