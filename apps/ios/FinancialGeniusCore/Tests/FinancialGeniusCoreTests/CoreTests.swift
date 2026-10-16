import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Testing
@testable import FinancialGeniusCore

/// Transporte simulado: guarda las peticiones y responde con lo que diga `handler`.
final class FakeTransport: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    let handler: @Sendable (URLRequest) throws -> (Int, String)

    init(_ handler: @escaping @Sendable (URLRequest) throws -> (Int, String)) { self.handler = handler }

    var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return _requests
    }

    private func registrar(_ r: URLRequest) {
        lock.lock()
        _requests.append(r)
        lock.unlock()
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        registrar(request)
        let (status, body) = try handler(request)
        let res = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (Data(body.utf8), res)
    }
}

func bodyJSON(_ r: URLRequest) -> [String: JSONValue] {
    guard let d = r.httpBody, case .object(let o)? = try? JSONDecoder().decode(JSONValue.self, from: d) else { return [:] }
    return o
}

@Suite("Conversiones de JavaScript")
struct JSTests {
    @Test func toFixedComoJS() {
        #expect(JS.toFixed(1.005, 2) == "1.00")
        #expect(JS.toFixed(0.005, 2) == "0.01")
        #expect(JS.toFixed(2.5, 0) == "3")
        #expect(JS.toFixed(9.995, 2) == "9.99")
        #expect(JS.toFixed(99.5, 0) == "100")
        #expect(JS.toFixed(0, 2) == "0.00")
        #expect(JS.toFixed(-1.5, 0) == "-2")
    }

    @Test func numeroATexto() {
        #expect(JS.numberToString(3) == "3")
        #expect(JS.numberToString(-0.0) == "0")
        #expect(JS.numberToString(7.3) == "7.3")
        #expect(JS.numberToString(150000) == "150000")
        #expect(JS.round(64.5) == 65)
        #expect(JS.round(-0.5) == 0)
    }
}

@Suite("Formulario de perfil")
struct PerfilFormularioTests {
    @Test func vacioDaErroresClaros() {
        guard case .errores(let e) = ProfileForm().validar() else { Issue.record("debía fallar"); return }
        #expect(e["netMonthlyIncome"] == "Requerido")
        #expect(e["age"] == "Escribe tu edad (16 o más)")
        #expect(e["employmentMonths"] == "Escribe los meses, por ejemplo 18")
        #expect(e["dependents"] == nil)
    }

    @Test func valido() {
        var f = ProfileForm()
        f.netMonthlyIncome = "B/. 1,500"
        f.employmentMonths = "18"
        f.age = "30"
        f.dependents = ""
        f.fixedMonthlyExpenses = "600"
        f.debts = [DebtForm(kind: .personalLoan, balance: "3,000", monthlyPayment: "120")]
        guard case .ok(let s) = f.validar() else { Issue.record("debía pasar"); return }
        #expect(s.netMonthlyIncome == 1500)
        #expect(s.dependents == 0)
        #expect(s.fixedMonthlyExpenses == 600)
        #expect(s.savingsForDownPayment == 0)
        #expect(s.debts == [Debt(kind: .personalLoan, balance: 3000, monthlyPayment: 120)])
    }

    @Test func tarjetaPideLimiteYMontosInvalidos() {
        var f = ProfileForm()
        f.netMonthlyIncome = "1500"
        f.employmentMonths = "1.5"
        f.age = "15"
        f.dependents = "x"
        f.savingsForDownPayment = "mucho"
        f.debts = [DebtForm(kind: .creditCard, balance: "200", monthlyPayment: "50")]
        guard case .errores(let e) = f.validar() else { Issue.record("debía fallar"); return }
        #expect(e["debts.0.limit"] == "Requerido")
        #expect(e["savingsForDownPayment"] == "Escribe un monto válido")
        #expect(e["employmentMonths"] == "Escribe los meses, por ejemplo 18")
        #expect(e["age"] == "Escribe tu edad (16 o más)")
        #expect(e["dependents"] == "Escribe un número, por ejemplo 0")
    }

    @Test func idaYVuelta() {
        let snap = FinancialSnapshot(
            netMonthlyIncome: 2200.5, employmentType: .selfEmployed, employmentMonths: 30, fixedMonthlyExpenses: 700, dependents: 2,
            age: 41, residency: .resident, apcSelfReported: .fair,
            debts: [Debt(kind: .creditCard, balance: 900, limit: 3000, monthlyPayment: 90)],
            savingsForDownPayment: 5000, documents: Documents(incomeProof: true), fieldSources: [:])
        let f = ProfileForm(snapshot: snap)
        #expect(f.netMonthlyIncome == "2200.5")
        #expect(f.validar() == .ok(snap))
    }
}

@Suite("Cliente de la API")
struct APIClientTests {
    @Test func enviaAutenticacionYDecodifica() async throws {
        let t = FakeTransport { req in
            switch (req.httpMethod!, req.url!.path) {
            case ("GET", "/v1/goals"):
                return (200, #"{"goals":[{"id":"g1","type":"mortgage","priority":1,"targetAmount":150000,"preferences":[],"status":"active","createdAt":"2026-10-01","readinessScore":65.1}]}"#)
            case ("POST", "/v1/chat"):
                return (200, #"{"conversationId":"c1","messageId":"m1","reply":"Hola","attachments":[{"type":"plan","goalId":"g1","objective":"Ahorrar","done":1,"total":3},{"type":"nuevo"}]}"#)
            case ("PATCH", "/v1/actions/a 1"):
                return (204, "")
            default:
                return (404, #"{"error":{"code":"not_found","message":"La meta no existe"}}"#)
            }
        }
        let api = APIClient(baseURL: "http://api.test/", transport: t, auth: { ["x-dev-user": "demo@ejemplo.test"] })
        let goals = try await api.goals()
        #expect(goals.first?.type == .mortgage)
        #expect(goals.first?.readinessScore == 65.1)
        #expect(t.requests[0].value(forHTTPHeaderField: "x-dev-user") == "demo@ejemplo.test")
        #expect(t.requests[0].url?.absoluteString == "http://api.test/v1/goals")

        let r = try await api.chat("hola")
        #expect(r.attachments == [.plan(goalId: "g1", objective: "Ahorrar", done: 1, total: 3), .unknown("nuevo")])
        #expect(bodyJSON(t.requests[1]) == ["message": .string("hola")], "sin conversationId no se manda la clave")

        try await api.setAction("a 1", status: .done)
        #expect(bodyJSON(t.requests[2]) == ["status": .string("done")])

        let plan = try await api.plan("x")
        #expect(plan == nil, "404 → nil")
        await #expect(throws: APIError(status: 404, code: "not_found", message: "La meta no existe")) { try await api.goal("x") }
    }

    @Test func avisaEn401YErrorDeRed() async throws {
        let flag = Flag()
        let api = APIClient(baseURL: "http://api.test", transport: FakeTransport { _ in (401, #"{"error":{"code":"unauthorized","message":"Autenticación requerida"}}"#) },
                            auth: { [:] }, onUnauthorized: { await flag.set() })
        await #expect(throws: APIError.self) { try await api.me() }
        let avisado = await flag.value
        #expect(avisado)

        let offline = APIClient(baseURL: "http://api.test", transport: FakeTransport { _ in throw URLError(.notConnectedToInternet) }, auth: { [:] })
        await #expect(throws: APIError.network) { try await offline.me() }
    }

    @Test func decodificaPreparacionYRecomendaciones() throws {
        let readiness = #"""
        {"goalId":"g1","goalType":"auto_loan","score":72.4,"readyToCompare":false,"weightsVersion":"w1","snapshotDate":"2026-10-14T15:00:00Z",
         "factors":[{"factor":"dti","score":0.5,"weight":0.3,"evidence":{"dti":0.466,"dtiGood":0.3}}],
         "obstacles":[{"factor":"dti","impactPoints":12.6,"blocking":true,"evidence":{"dti":0.466,"dtiGood":0.3,"estimatedNewPayment":null},"suggestedActions":["Paga"]}]}
        """#
        let r = try JSONDecoder().decode(ReadinessView.self, from: Data(readiness.utf8))
        #expect(Formato.obstacleDetail(r.obstacles[0].factor, r.obstacles[0].evidence) == "Con la nueva cuota, tus deudas serían el 47% de tu ingreso. Lo ideal es hasta 30%.")

        let rec = #"""
        {"goalId":"g1","eligibleCount":3,"consideredCount":5,"excluded":[{"productId":"x","failed":["minIncome"]}],"readyToCompare":true,"notice":null,
         "audit":{"catalogVersion":"c","weightsVersion":"w","inputHash":"h"},
         "top":[{"position":1,"productId":"alfa-auto","institutionName":"Banco Alfa","name":"Alfa Auto Nuevo","score":0.9,
                 "components":{"cost":1,"eligibility":1,"benefits":0,"affordability":1},"estimatedMonthlyPayment":389.03,
                 "reasons":[{"code":"lowest_cost","params":{"compared":3}}],"assumptions":["Tasa 7.5%"],
                 "source":{"url":"https://alfa.example/auto","capturedAt":"2026-10-01"}}]}
        """#
        let v = try JSONDecoder().decode(RecommendationsView.self, from: Data(rec.utf8))
        #expect(v.top[0].estimatedMonthlyPayment == 389.03)
        #expect(Formato.reasonText(v.top[0].reasons[0]) == "El costo más bajo de 3 opciones que calificas")
        #expect(v.notice == nil)
    }
}

actor Flag {
    var value = false
    func set() { value = true }
}

@Suite("Supabase Auth")
struct SupabaseAuthTests {
    @Test func codigoYSesion() async throws {
        let t = FakeTransport { req in
            switch req.url!.path {
            case "/auth/v1/otp": return (200, "{}")
            case "/auth/v1/verify":
                return (200, #"{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"id":"u1","email":"Ana@Ejemplo.test"}}"#)
            default: return (400, #"{"error_code":"otp_expired","msg":"Token has expired"}"#)
            }
        }
        let auth = SupabaseAuth(url: "https://p.supabase.co/", anonKey: "anon", transport: t, now: { 1000 })
        try await auth.requestCode(email: "  Ana@Ejemplo.test ")
        #expect(t.requests[0].value(forHTTPHeaderField: "apikey") == "anon")
        #expect(bodyJSON(t.requests[0]) == ["email": .string("ana@ejemplo.test"), "create_user": .bool(true)])

        let s = try await auth.verifyCode(email: "ana@ejemplo.test", code: "123 456")
        #expect(s == AuthSession(accessToken: "at", refreshToken: "rt", expiresAt: 4600, userId: "u1", email: "ana@ejemplo.test"))
        #expect(bodyJSON(t.requests[1])["token"] == .string("123456"))
        #expect(s.needsRefresh(now: 4541))
        #expect(!s.needsRefresh(now: 4000))

        await #expect(throws: AuthError(code: "otp_expired")) { try await auth.refresh(s) }
        #expect(t.requests[2].url?.query == "grant_type=refresh_token")
        #expect(AuthError(code: "otp_expired").message == "El código venció o no es correcto. Pide uno nuevo.")
    }
}
