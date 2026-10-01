// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'puntos_de_acceso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PuntosDeAccesoDto _$PuntosDeAccesoDtoFromJson(Map<String, dynamic> json) =>
    PuntosDeAccesoDto(
      puntos: (json['puntos'] as List<dynamic>)
          .map((e) => PuntoDeAccesoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PuntosDeAccesoDtoToJson(PuntosDeAccesoDto instance) =>
    <String, dynamic>{'puntos': instance.puntos};
