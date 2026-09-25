// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'edicion_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EdicionDeEquipoDto _$EdicionDeEquipoDtoFromJson(Map<String, dynamic> json) =>
    EdicionDeEquipoDto(
      protocolo: json['protocolo'] == null
          ? EdicionDeEquipoDtoProtocolo.http
          : EdicionDeEquipoDtoProtocolo.fromJson(json['protocolo'] as String),
      canalDeAudioHabilitado: json['canalDeAudioHabilitado'] as bool? ?? false,
      probarConexion: json['probarConexion'] as bool? ?? true,
      nombre: json['nombre'] as String?,
      tipo: json['tipo'] == null
          ? null
          : EdicionDeEquipoDtoTipo.fromJson(json['tipo'] as String),
      host: json['host'] as String?,
      puerto: json['puerto'] as num?,
      usuario: json['usuario'] as String?,
      secreto: json['secreto'] as String?,
      canalBarrera: json['canalBarrera'] as num?,
      numeroDePuerta: json['numeroDePuerta'] as num?,
      canalDeAudio: json['canalDeAudio'] as num?,
      fabricante: json['fabricante'] as String?,
      modoDeTerminal: json['modoDeTerminal'] == null
          ? null
          : EdicionDeEquipoDtoModoDeTerminal.fromJson(
              json['modoDeTerminal'] as String,
            ),
    );

Map<String, dynamic> _$EdicionDeEquipoDtoToJson(EdicionDeEquipoDto instance) =>
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
      'fabricante': instance.fabricante,
      'modoDeTerminal': instance.modoDeTerminal,
      'canalDeAudioHabilitado': instance.canalDeAudioHabilitado,
      'probarConexion': instance.probarConexion,
    };
