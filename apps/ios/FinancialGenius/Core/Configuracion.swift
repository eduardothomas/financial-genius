import Foundation

/// Configuración por entorno, leída del Info.plist (se fija al compilar: FG_API_URL, FG_SUPABASE_URL, FG_SUPABASE_ANON_KEY).
/// Sin Supabase, la app entra en modo desarrollo (solo correo, encabezado x-dev-user).
/// La clave anon de Supabase es pública; la service_role nunca va en la app.
struct Configuracion: Sendable {
    var apiURL: String
    var supabaseURL: String?
    var supabaseAnonKey: String?

    static var actual: Configuracion {
        func valor(_ clave: String) -> String? {
            guard let v = Bundle.main.object(forInfoDictionaryKey: clave) as? String else { return nil }
            let t = v.trimmingCharacters(in: .whitespaces)
            return t.isEmpty || t.hasPrefix("$(") ? nil : t
        }
        let supabaseURL = valor("FGSupabaseURL")
        let anon = valor("FGSupabaseAnonKey")
        return Configuracion(
            apiURL: valor("FGApiURL") ?? "http://localhost:3000",
            supabaseURL: anon == nil ? nil : supabaseURL,
            supabaseAnonKey: supabaseURL == nil ? nil : anon)
    }
}
