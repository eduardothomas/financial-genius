import Foundation
import Observation
import FinancialGeniusCore

/// Sesión del usuario.
///  - Supabase Auth (producción): código por correo, token Bearer que se refresca solo, guardado en el Llavero.
///  - Desarrollo: sin Supabase configurado, se entra solo con el correo (encabezado x-dev-user).
@MainActor
@Observable
final class Sesion {
    enum Modo { case desarrollo, supabase }

    let modo: Modo
    let api: APIClient
    private(set) var email: String?
    /// Meta elegida para Plan y Productos.
    var metaId: String?

    @ObservationIgnored private var auth: AuthSession?
    private let supabase: SupabaseAuth?
    @ObservationIgnored private var refresco: Task<AuthSession?, Never>?

    private static let claveDev = "fg.devEmail"
    private static let claveAuth = "fg.auth"

    init(config: Configuracion = .actual) {
        let ref = Referencia()
        let sb: SupabaseAuth? = {
            guard let url = config.supabaseURL, let key = config.supabaseAnonKey else { return nil }
            return SupabaseAuth(url: url, anonKey: key)
        }()
        supabase = sb
        modo = sb == nil ? .desarrollo : .supabase
        api = APIClient(
            baseURL: config.apiURL,
            auth: { @MainActor in await ref.sesion?.encabezados() ?? [:] },
            onUnauthorized: { @MainActor in ref.sesion?.sesionInvalida() })
        if sb != nil {
            let guardada = Llavero.leer(Self.claveAuth).flatMap { try? JSONDecoder().decode(AuthSession.self, from: $0) }
            auth = guardada
            email = guardada?.email
        } else {
            email = UserDefaults.standard.string(forKey: Self.claveDev)
        }
        ref.sesion = self
    }

    // MARK: Entrar y salir

    /// Modo desarrollo.
    func entrar(email correo: String) {
        let v = correo.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        UserDefaults.standard.set(v, forKey: Self.claveDev)
        email = v
    }

    /// Modo Supabase, paso 1.
    func pedirCodigo(_ correo: String) async throws {
        guard let supabase else { return }
        try await supabase.requestCode(email: correo)
    }

    /// Modo Supabase, paso 2.
    func verificarCodigo(_ correo: String, _ codigo: String) async throws {
        guard let supabase else { return }
        guardarAuth(try await supabase.verifyCode(email: correo, code: codigo))
    }

    func salir() {
        if let s = auth, let supabase { Task { await supabase.signOut(s) } }
        guardarAuth(nil)
        UserDefaults.standard.removeObject(forKey: Self.claveDev)
        email = nil
        metaId = nil
    }

    /// Borra la cuenta y todos sus datos en el servidor, y cierra la sesión.
    func eliminarCuenta() async throws {
        try await api.deleteMe()
        salir()
    }

    // MARK: Tokens

    private func guardarAuth(_ a: AuthSession?) {
        auth = a
        if modo == .supabase { email = a?.email }
        Llavero.guardar(a.flatMap { try? JSONEncoder().encode($0) }, Self.claveAuth)
    }

    fileprivate func encabezados() async -> [String: String] {
        switch modo {
        case .desarrollo:
            return email.map { ["x-dev-user": $0] } ?? [:]
        case .supabase:
            guard let t = await tokenVigente() else { return [:] }
            return ["authorization": "Bearer \(t)"]
        }
    }

    /// Token vigente; refresca una sola vez aunque haya varias peticiones a la vez.
    private func tokenVigente() async -> String? {
        guard let s = auth, let supabase else { return nil }
        if !s.needsRefresh(now: Date().timeIntervalSince1970) { return s.accessToken }
        let tarea = refresco ?? Task { try? await supabase.refresh(s) }
        refresco = tarea
        let nuevo = await tarea.value
        if refresco == tarea { refresco = nil }
        guard let nuevo else {
            if auth != nil { salir() }
            return nil
        }
        if auth != nuevo { guardarAuth(nuevo) }
        return nuevo.accessToken
    }

    fileprivate func sesionInvalida() {
        if modo == .supabase, auth != nil { salir() }
    }
}

/// Referencia débil a la sesión para los cierres del cliente de la API.
@MainActor
private final class Referencia {
    weak var sesion: Sesion?
}

enum Pestana: Hashable {
    case genio, metas, plan, productos, perfil
}

/// Pestaña activa y rutas, para que las tarjetas del Genio lleven a cualquier pantalla.
@MainActor
@Observable
final class Navegacion {
    var pestana: Pestana = .genio
    var rutaMetas: [String] = []
    var nuevaMeta = false

    func ir(a destino: Destino, sesion: Sesion, goalId: String) {
        sesion.metaId = goalId
        switch destino {
        case .productos: pestana = .productos
        case .plan: pestana = .plan
        case .meta(let id):
            rutaMetas = [id]
            pestana = .metas
        }
    }

    func reiniciar() {
        pestana = .genio
        rutaMetas = []
        nuevaMeta = false
    }
}
