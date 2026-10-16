import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Sesión de Supabase Auth. Se guarda en el Llavero (Keychain).
public struct AuthSession: Codable, Sendable, Equatable {
    public var accessToken: String
    public var refreshToken: String
    /// Segundos Unix en que vence el access token.
    public var expiresAt: Double
    public var userId: String
    public var email: String

    /// ¿Hay que refrescar ya? (margen de 60 s antes del vencimiento)
    public func needsRefresh(now: Double, margin: Double = 60) -> Bool { expiresAt - now <= margin }
}

public struct AuthError: Error, LocalizedError, Equatable, Sendable {
    public var code: String
    public var message: String
    public var errorDescription: String? { message }
    public init(code: String) {
        self.code = code
        self.message = AuthError.message(for: code)
    }

    /// Mensajes en español para los errores más comunes de Supabase Auth.
    public static func message(for code: String) -> String {
        switch code {
        case "otp_expired": "El código venció o no es correcto. Pide uno nuevo."
        case "over_email_send_rate_limit", "over_request_rate_limit": "Espera un momento antes de pedir otro código."
        case "email_address_invalid", "validation_failed": "Revisa que el correo esté bien escrito."
        case "refresh_token_not_found", "refresh_token_already_used", "session_not_found": "Tu sesión terminó. Vuelve a entrar."
        case "network": "No pudimos conectar. Revisa tu conexión."
        default: "No pudimos completar el inicio de sesión. Intenta de nuevo."
        }
    }
}

/// Inicio de sesión por código de un solo uso enviado al correo (sin contraseñas),
/// con la API REST de Supabase Auth. La clave anon es pública; la service_role nunca va en la app.
public struct SupabaseAuth: Sendable {
    let base: String
    let anonKey: String
    let transport: any HTTPTransport
    let now: @Sendable () -> Double

    public init(url: String, anonKey: String, transport: any HTTPTransport = URLSessionTransport(),
                now: @escaping @Sendable () -> Double = { Date().timeIntervalSince1970 }) {
        var u = url
        while u.hasSuffix("/") { u.removeLast() }
        self.base = "\(u)/auth/v1"
        self.anonKey = anonKey
        self.transport = transport
        self.now = now
    }

    private func post(_ path: String, _ body: [String: JSONValue], bearer: String? = nil) async throws -> JSONValue {
        guard let url = URL(string: base + path) else { throw AuthError(code: "bad_url") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let bearer { req.setValue("Bearer \(bearer)", forHTTPHeaderField: "authorization") }
        req.httpBody = try JSONEncoder().encode(body)
        let result: (Data, HTTPURLResponse)
        do {
            result = try await transport.send(req)
        } catch {
            throw AuthError(code: "network")
        }
        let (data, res) = result
        let json = data.isEmpty ? JSONValue.null : ((try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null)
        guard (200..<300).contains(res.statusCode) else {
            var code = "http_\(res.statusCode)"
            if case .object(let o) = json {
                for key in ["error_code", "code", "error"] {
                    if let v = o[key], !v.isNull {
                        code = v.jsString
                        break
                    }
                }
            }
            throw AuthError(code: code)
        }
        return json
    }

    func toSession(_ d: JSONValue) throws -> AuthSession {
        guard case .object(let o) = d,
              case .string(let access)? = o["access_token"], !access.isEmpty,
              case .string(let refresh)? = o["refresh_token"], !refresh.isEmpty,
              case .object(let user)? = o["user"], case .string(let userId)? = user["id"], !userId.isEmpty
        else { throw AuthError(code: "bad_response") }
        let expiresAt: Double
        if case .number(let e)? = o["expires_at"] {
            expiresAt = e
        } else {
            let inSec = o["expires_in"].map { $0.jsNumber } ?? 3600
            expiresAt = now() + (inSec.isFinite ? inSec : 3600)
        }
        let email: String
        if case .string(let e)? = user["email"] { email = e.lowercased() } else { email = "" }
        return AuthSession(accessToken: access, refreshToken: refresh, expiresAt: expiresAt, userId: userId, email: email)
    }

    static func clean(_ email: String) -> String { email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    /// Envía el código al correo (crea la cuenta si no existe).
    public func requestCode(email: String) async throws {
        _ = try await post("/otp", ["email": .string(Self.clean(email)), "create_user": .bool(true)])
    }

    /// Cambia correo + código por una sesión.
    public func verifyCode(email: String, code: String) async throws -> AuthSession {
        let token = String(code.filter { !$0.isWhitespace })
        return try toSession(try await post("/verify", ["type": .string("email"), "email": .string(Self.clean(email)), "token": .string(token)]))
    }

    public func refresh(_ s: AuthSession) async throws -> AuthSession {
        try toSession(try await post("/token?grant_type=refresh_token", ["refresh_token": .string(s.refreshToken)]))
    }

    /// Cierra la sesión en el servidor; si falla, igual se borra localmente.
    public func signOut(_ s: AuthSession) async {
        _ = try? await post("/logout", [:], bearer: s.accessToken)
    }
}
