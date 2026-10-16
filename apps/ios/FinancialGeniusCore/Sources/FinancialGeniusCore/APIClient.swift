import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Transporte HTTP: URLSession en la app; uno simulado en las pruebas.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    public init() {}
    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await withCheckedThrowingContinuation { cont in
            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let http = response as? HTTPURLResponse {
                    cont.resume(returning: (data ?? Data(), http))
                } else {
                    cont.resume(throwing: URLError(.badServerResponse))
                }
            }.resume()
        }
    }
}

/// Error de la API con el mensaje en español que manda el servidor.
public struct APIError: Error, LocalizedError, Equatable, Sendable {
    public var status: Int
    public var code: String
    public var message: String
    public init(status: Int, code: String, message: String) {
        self.status = status
        self.code = code
        self.message = message
    }
    public var errorDescription: String? { message }
    public static let network = APIError(status: 0, code: "network", message: "No pudimos conectar con el servidor. Revisa tu conexión.")
}

private struct ErrorBody: Decodable {
    struct Inner: Decodable {
        var code: String?
        var message: String?
    }
    var error: Inner?
}

/// Cliente tipado de la API v1 (mismo contrato que apps/app/src/lib/api.ts).
public final class APIClient: Sendable {
    public typealias AuthHeaders = @Sendable () async -> [String: String]

    let baseURL: String
    let transport: any HTTPTransport
    let auth: AuthHeaders
    let onUnauthorized: @Sendable () async -> Void

    public init(baseURL: String, transport: any HTTPTransport = URLSessionTransport(),
                auth: @escaping AuthHeaders, onUnauthorized: @escaping @Sendable () async -> Void = {}) {
        var b = baseURL
        while b.hasSuffix("/") { b.removeLast() }
        self.baseURL = b
        self.transport = transport
        self.auth = auth
        self.onUnauthorized = onUnauthorized
    }

    /// Petición cruda: nil si la respuesta no tiene cuerpo (204).
    func raw(_ method: String, _ path: String, body: (any Encodable & Sendable)? = nil) async throws -> Data? {
        guard let url = URL(string: baseURL + path) else { throw APIError(status: 0, code: "bad_url", message: "Dirección inválida") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "accept")
        let headers = await auth()
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            req.httpBody = try encoder.encode(body)
        }
        let result: (Data, HTTPURLResponse)
        do {
            result = try await transport.send(req)
        } catch {
            throw APIError.network
        }
        let (data, res) = result
        if res.statusCode == 204 || data.isEmpty {
            if (200..<300).contains(res.statusCode) { return nil }
        }
        guard (200..<300).contains(res.statusCode) else {
            if res.statusCode == 401 { await onUnauthorized() }
            let e = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw APIError(status: res.statusCode, code: e?.code ?? "unknown", message: e?.message ?? "Error \(res.statusCode)")
        }
        return data
    }

    func request<T: Decodable>(_ method: String, _ path: String, body: (any Encodable & Sendable)? = nil, as type: T.Type = T.self) async throws -> T {
        guard let data = try await raw(method, path, body: body) else {
            throw APIError(status: 200, code: "empty", message: "Respuesta vacía del servidor")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: 200, code: "decode", message: "No pudimos leer la respuesta del servidor.")
        }
    }

    /// 404 → nil (recursos que pueden no existir todavía).
    func maybe<T: Decodable>(_ method: String, _ path: String, as type: T.Type = T.self) async throws -> T? {
        do {
            return try await request(method, path, as: T.self)
        } catch let e as APIError where e.status == 404 {
            return nil
        }
    }

    static func seg(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.~"))) ?? id
    }

    // MARK: - Endpoints

    private struct Goals: Decodable { var goals: [GoalView] }
    private struct Conversations: Decodable { var conversations: [ConversationSummary] }
    private struct Conversation: Decodable { var messages: [ChatMessage] }
    private struct ChatBody: Encodable, Sendable { var message: String; var conversationId: String? }
    private struct StatusBody: Encodable, Sendable { var status: ActionStatus }
    public struct Created: Decodable, Sendable { public var id: String }

    public func me() async throws -> Me { try await request("GET", "/v1/me") }
    public func deleteMe() async throws { _ = try await raw("DELETE", "/v1/me") }
    public func snapshot() async throws -> SnapshotRecord? { try await maybe("GET", "/v1/me/snapshot") }
    @discardableResult
    public func saveSnapshot(_ s: FinancialSnapshot) async throws -> Created { try await request("POST", "/v1/me/snapshot", body: s) }
    public func goals() async throws -> [GoalView] { try await request("GET", "/v1/goals", as: Goals.self).goals }
    public func goal(_ id: String) async throws -> GoalView { try await request("GET", "/v1/goals/\(Self.seg(id))") }
    public func createGoal(_ g: GoalInput) async throws -> GoalView { try await request("POST", "/v1/goals", body: g) }
    public func readiness(_ id: String) async throws -> ReadinessView { try await request("GET", "/v1/goals/\(Self.seg(id))/readiness") }
    public func recommendations(_ id: String) async throws -> RecommendationsView {
        try await request("GET", "/v1/goals/\(Self.seg(id))/recommendations")
    }
    public func plan(_ id: String) async throws -> PlanView? { try await maybe("GET", "/v1/goals/\(Self.seg(id))/plan") }
    public func createPlan(_ id: String) async throws -> PlanView { try await request("POST", "/v1/goals/\(Self.seg(id))/plan") }
    public func setAction(_ id: String, status: ActionStatus) async throws {
        _ = try await raw("PATCH", "/v1/actions/\(Self.seg(id))", body: StatusBody(status: status))
    }
    public func chat(_ message: String, conversationId: String? = nil) async throws -> ChatReply {
        try await request("POST", "/v1/chat", body: ChatBody(message: message, conversationId: conversationId))
    }
    public func conversations() async throws -> [ConversationSummary] {
        try await request("GET", "/v1/chat/conversations", as: Conversations.self).conversations
    }
    public func conversation(_ id: String) async throws -> [ChatMessage] {
        try await request("GET", "/v1/chat/conversations/\(Self.seg(id))", as: Conversation.self).messages
    }
}
