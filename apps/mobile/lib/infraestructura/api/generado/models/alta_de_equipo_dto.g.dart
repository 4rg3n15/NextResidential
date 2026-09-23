// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alta_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AltaDeEquipoDto _$AltaDeEquipoDtoFromJson(Map<String, dynamic> json) =>
    AltaDeEquipoDto(
      nombre: json['nombre'] as String,
      tipo: AltaDeEquipoDtoTipo.fromJson(json['tipo'] as String),
      host: json['host'] as String,
      puerto: json['puerto'] as num,
      usuario: json['usuario'] as String,
      secreto: json['secreto'] as String?,
      canalBarrera: json['canalBarrera'] as num?,
      numeroDePuerta: json['numeroDePuerta'] as num?,
      canalDeAudio: json['canalDeAudio'] as num?,
      protocolo: json['protocolo'] == null
          ? AltaDeEquipoDtoProtocolo.http
          : AltaDeEquipoDtoProtocolo.fromJson(json['protocolo'] as String),
      probarConexion: json['probarConexion'] as bool? ?? true,
    );

Map<String, dynamic> _$AltaDeEquipoDtoToJson(AltaDeEquipoDto instance) =>
    <String, dynamic>{
      'nombre': instance.nombre,
      'tipo': instance.tipo,
      'host': instance.host,
      'puerto': instance.puerto,
      'protocolo': instance.protocolo,
      'usuario': instance.usuario,
      'secreto': instance.secreto,
      'canalBarrera': instance.canalBarrera,
      'numeroDePuerta': instance.numeroDePuerta,
      'canalDeAudio': instance.canalDeAudio,
      'probarConexion': instance.probarConexion,
    };
