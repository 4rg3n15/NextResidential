// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dispositivo_del_tablero_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DispositivoDelTableroDto _$DispositivoDelTableroDtoFromJson(
  Map<String, dynamic> json,
) => DispositivoDelTableroDto(
  id: json['id'] as String,
  nombre: json['nombre'] as String,
  tipo: DispositivoDelTableroDtoTipo.fromJson(json['tipo'] as String),
  zonaId: json['zonaId'] as String?,
  host: json['host'] as String?,
  puerto: json['puerto'] as num?,
  modelo: json['modelo'] as String?,
  firmware: json['firmware'] as String?,
  estado: DispositivoDelTableroDtoEstado.fromJson(json['estado'] as String),
  ultimoLatido: json['ultimoLatido'] == null
      ? null
      : DateTime.parse(json['ultimoLatido'] as String),
  ultimaSincronizacion: json['ultimaSincronizacion'] == null
      ? null
      : DateTime.parse(json['ultimaSincronizacion'] as String),
  segundosSinLatir: json['segundosSinLatir'] as num?,
);

Map<String, dynamic> _$DispositivoDelTableroDtoToJson(
  DispositivoDelTableroDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'tipo': instance.tipo,
  'zonaId': instance.zonaId,
  'host': instance.host,
  'puerto': instance.puerto,
  'modelo': instance.modelo,
  'firmware': instance.firmware,
  'estado': instance.estado,
  'ultimoLatido': instance.ultimoLatido?.toIso8601String(),
  'ultimaSincronizacion': instance.ultimaSincronizacion?.toIso8601String(),
  'segundosSinLatir': instance.segundosSinLatir,
};
