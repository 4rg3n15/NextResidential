// Ventana y menús propios, y una política de red que solo admite el backend
// propio. ADR-002: Tauri, no Electron — menos superficie de ataque y menos
// tamaño sobre la misma base Next.js.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod menu;
mod red;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            /*
             * LA VENTANA SE CONSTRUYE AQUÍ Y NO EN `tauri.conf.json`, y es por
             * una razón y no por gusto: `on_navigation` es un método del
             * constructor de la vista web, no del de la aplicación. Una ventana
             * declarada en la configuración nace sin ese filtro.
             *
             * Y el filtro es el punto entero. La consola es una aplicación
             * SERVIDA —Next.js con renderizado en servidor—, así que el
             * empaquetado apunta a una URL y no a un directorio estático. Eso
             * significa que la ventana podría navegar a cualquier sitio si
             * nadie lo impide: basta un enlace, una redirección o una inyección
             * para que la ventana de escritorio, que lleva la sesión del
             * operador, acabe en un dominio ajeno.
             */
            let destino = tauri::Url::parse(red::origen_principal())
                .expect("NCR_ORIGENES_ESCRITORIO tiene que empezar por un origen válido");

            WebviewWindowBuilder::new(app, "consola", WebviewUrl::External(destino))
                .title("Next Control Residencial")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .resizable(true)
                .center()
                .on_navigation(red::solo_el_backend_propio)
                .build()?;

            menu::instalar(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al arrancar la consola de escritorio");
}
