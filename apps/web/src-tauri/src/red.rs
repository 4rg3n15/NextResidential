use tauri::Url;

/// Orígenes admitidos por la ventana de escritorio.
///
/// Se leen del entorno de COMPILACIÓN (`NCR_ORIGENES_ESCRITORIO`, separados por
/// comas) y no de un fichero de configuración junto al ejecutable. La razón es
/// la de §2.7: un fichero al lado del binario lo puede editar quien tenga el
/// equipo, y con ello redirigir la ventana que lleva la sesión del operador a
/// un servidor suyo. Compilado dentro, cambiarlo exige volver a firmar.
///
/// El valor por omisión es el de desarrollo, y solo sirve en desarrollo.
const ORIGENES: &str = match option_env!("NCR_ORIGENES_ESCRITORIO") {
    Some(v) => v,
    None => "http://localhost:3001",
};

/// `true` deja navegar; `false` cancela la navegación dentro de la ventana.
pub fn admitida(url: &Url) -> bool {
    // `ipc:` y `tauri:` son el canal interno del propio marco de trabajo.
    if matches!(url.scheme(), "ipc" | "tauri") {
        return true;
    }
    let origen = origen_de(url);
    ORIGENES
        .split(',')
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .any(|permitido| permitido == origen)
}

/// Forma canónica `esquema://host[:puerto]`, que es como se compara un origen.
/// Sin esto, `https://consola.ejemplo.co/ruta` no casaría con su propio origen
/// —es el mismo defecto que H-13-21 corrigió en el CORS de la API—.
fn origen_de(url: &Url) -> String {
    match (url.host_str(), url.port()) {
        (Some(host), Some(puerto)) => format!("{}://{}:{}", url.scheme(), host, puerto),
        (Some(host), None) => format!("{}://{}", url.scheme(), host),
        (None, _) => String::new(),
    }
}

/// Primer origen de la lista: el que abre la ventana al arrancar.
pub fn origen_principal() -> &'static str {
    match ORIGENES.split(',').map(str::trim).find(|o| !o.is_empty()) {
        Some(o) => o,
        None => "http://localhost:3001",
    }
}

pub fn solo_el_backend_propio(url: &Url) -> bool {
    admitida(url)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).expect("url de prueba válida")
    }

    #[test]
    fn admite_el_origen_propio_y_sus_rutas() {
        assert!(admitida(&u("http://localhost:3001/")));
        assert!(admitida(&u("http://localhost:3001/tablero")));
        assert!(admitida(&u("http://localhost:3001/tablero?x=1#y")));
    }

    #[test]
    fn rechaza_cualquier_otro_origen() {
        assert!(!admitida(&u("https://ejemplo.invalid/")));
        // Mismo host, OTRO puerto: es otro origen.
        assert!(!admitida(&u("http://localhost:3002/")));
        // Mismo host y puerto, OTRO esquema.
        assert!(!admitida(&u("https://localhost:3001/")));
        // El truco clásico: el host propio como PREFIJO de otro dominio, con
        // el mismo puerto para que a ojo parezca el de siempre.
        assert!(!admitida(&u("http://localhost.ejemplo.invalid:3001/")));
        // Y como CREDENCIALES de un dominio ajeno: lo que un humano lee como
        // «localhost» es aquí el nombre de usuario, y el host es el de enfrente.
        // (`localhost:3001@…` no llega ni a analizarse: `InvalidPort`.)
        assert!(!admitida(&u("http://localhost@ejemplo.invalid/")));
    }

    #[test]
    fn deja_pasar_el_canal_interno() {
        assert!(admitida(&u("ipc://localhost/")));
        assert!(admitida(&u("tauri://localhost/")));
    }
}
