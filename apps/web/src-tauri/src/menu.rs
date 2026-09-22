use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Manager};

/// Menús propios, en español y con lo que un operador usa de verdad.
///
/// El menú por omisión de Tauri es el del sistema en inglés. Aquí se declara el
/// mínimo útil —recargar la consola, pantalla completa, acerca de— y **no** se
/// incluyen las herramientas de desarrollo en las compilaciones de entrega:
/// una consola de desarrollador abierta en un puesto de portería es acceso a la
/// sesión del operador.
pub fn instalar(app: &mut App) -> tauri::Result<()> {
    let manejador = app.handle();

    let recargar = MenuItem::with_id(manejador, "recargar", "Recargar consola", true, None::<&str>)?;
    let consola = Submenu::with_items(
        manejador,
        "Consola",
        true,
        &[
            &PredefinedMenuItem::about(manejador, Some("Acerca de"), Some(AboutMetadata::default()))?,
            &PredefinedMenuItem::separator(manejador)?,
            &recargar,
            &PredefinedMenuItem::fullscreen(manejador, Some("Pantalla completa"))?,
            &PredefinedMenuItem::separator(manejador)?,
            &PredefinedMenuItem::quit(manejador, Some("Salir"))?,
        ],
    )?;

    let edicion = Submenu::with_items(
        manejador,
        "Edición",
        true,
        &[
            &PredefinedMenuItem::copy(manejador, Some("Copiar"))?,
            &PredefinedMenuItem::paste(manejador, Some("Pegar"))?,
            &PredefinedMenuItem::select_all(manejador, Some("Seleccionar todo"))?,
        ],
    )?;

    let menu = Menu::with_items(manejador, &[&consola, &edicion])?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, evento| {
        if evento.id() == "recargar" {
            if let Some(ventana) = app.get_webview_window("consola") {
                let _ = ventana.eval("window.location.reload()");
            }
        }
    });

    Ok(())
}
