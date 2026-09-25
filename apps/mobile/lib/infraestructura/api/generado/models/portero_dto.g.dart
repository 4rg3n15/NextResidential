// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'portero_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PorteroDto _$PorteroDtoFromJson(Map<String, dynamic> json) => PorteroDto(
  usuarioId: json['usuarioId'] as String,
  usuario: json['usuario'] as String?,
  nombre: json['nombre'] as String,
  telefono: json['telefono'] as String?,
  correoContacto: json['correoContacto'] as String?,
  porteria: json['porteria'] as String?,
  sectores: (json['sectores'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  debeCambiarContrasena: json['debeCambiarContrasena'] as bool,
  turnoVigente: json['turnoVigente'] == null
      ? null
      : TurnoDto.fromJson(json['turnoVigente'] as Map<String, dynamic>),
  sesionAbierta: json['sesionAbierta'] == null
      ? null
      : SesionAbiertaDto.fromJson(
          json['sesionAbierta'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$PorteroDtoToJson(PorteroDto instance) =>
    <String, dynamic>{
      'usuarioId': instance.usuarioId,
      'usuario': instance.usuario,
      'nombre': instance.nombre,
      'telefono': instance.telefono,
      'correoContacto': instance.correoContacto,
      'porteria': instance.porteria,
      'sectores': instance.sectores,
      'debeCambiarContrasena': instance.debeCambiarContrasena,
      'turnoVigente': instance.turnoVigente,
      'sesionAbierta': instance.sesionAbierta,
    };
