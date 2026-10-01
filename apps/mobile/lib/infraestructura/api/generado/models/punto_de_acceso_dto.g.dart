// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'punto_de_acceso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PuntoDeAccesoDto _$PuntoDeAccesoDtoFromJson(Map<String, dynamic> json) =>
    PuntoDeAccesoDto(
      id: json['id'] as String,
      dispositivoId: json['dispositivoId'] as String,
      nombre: json['nombre'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num,
      modulo: json['modulo'] as String?,
      rutaEnElEquipo: json['rutaEnElEquipo'] as String?,
      origen: PuntoDeAccesoDtoOrigen.fromJson(json['origen'] as String),
      descubiertoEn: json['descubiertoEn'] == null
          ? null
          : DateTime.parse(json['descubiertoEn'] as String),
    );

Map<String, dynamic> _$PuntoDeAccesoDtoToJson(PuntoDeAccesoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'dispositivoId': instance.dispositivoId,
      'nombre': instance.nombre,
      'numeroDePuerta': instance.numeroDePuerta,
      'modulo': instance.modulo,
      'rutaEnElEquipo': instance.rutaEnElEquipo,
      'origen': instance.origen,
      'descubiertoEn': instance.descubiertoEn?.toIso8601String(),
    };
