import Foundation
import Testing
@testable import FinancialGeniusCore

/// Casos dorados generados desde la app TypeScript (apps/app/scripts/casos-dorados.ts):
/// iOS debe decir exactamente lo mismo que Android y web.
struct CasosDorados: Decodable {
    struct Money: Decodable { var n: Double; var decimals: Int; var out: String }
    struct Texto: Decodable {
        var entrada: String
        var out: String
        enum CodingKeys: String, CodingKey { case entrada = "in", out }
    }
    struct Razon: Decodable { var reason: Reason; var out: String }
    struct Freno: Decodable { var factor: String; var evidence: [String: JSONValue]; var out: String }
    struct Nivel: Decodable { var score: Double; var ready: Bool; var out: String }
    struct Monto: Decodable {
        var entrada: String
        var out: Double?
        enum CodingKeys: String, CodingKey { case entrada = "in", out }
    }
    struct Sugerencia: Decodable {
        struct G: Decodable { var type: GoalType; var priority: Int }
        var goals: [G]
        var hasProfile: Bool
        var out: [String]
    }
    struct Tarjeta: Decodable {
        struct Out: Decodable { var title: String; var detail: String; var href: String; var goalId: String }
        var attachment: ChatAttachment
        var out: Out
    }

    var money: [Money]
    var pct: [Money]
    var goalLabel: [String: String]
    var goalHint: [String: String]
    var factorLabel: [String: String]
    var benefitLabel: [Texto]
    var reasonText: [Razon]
    var obstacleDetail: [Freno]
    var levelLabel: [Nivel]
    var weekLabel: [Texto]
    var monthLabel: [Texto]
    var parseAmount: [Monto]
    var suggestions: [Sugerencia]
    var attachmentCard: [Tarjeta]

    static func cargar() throws -> CasosDorados {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("casos-dorados.json")
        return try JSONDecoder().decode(CasosDorados.self, from: Data(contentsOf: url))
    }
}

@Suite("Casos dorados (iguales a TypeScript)")
struct CasosDoradosTests {
    let c: CasosDorados
    init() throws { c = try CasosDorados.cargar() }

    @Test func montos() {
        #expect(c.money.count > 10)
        for m in c.money { #expect(Formato.money(m.n, decimals: m.decimals) == m.out, "money(\(m.n), \(m.decimals))") }
    }

    @Test func porcentajes() {
        for m in c.pct { #expect(Formato.pct(m.n, decimals: m.decimals) == m.out, "pct(\(m.n), \(m.decimals))") }
    }

    @Test func etiquetas() {
        #expect(c.goalLabel.count == GoalType.allCases.count)
        for t in GoalType.allCases {
            #expect(Formato.goalLabel(t) == c.goalLabel[t.rawValue])
            #expect(Formato.goalHint(t) == c.goalHint[t.rawValue])
        }
        #expect(c.factorLabel.count == FactorId.allCases.count)
        for f in FactorId.allCases { #expect(Formato.factorLabel(f) == c.factorLabel[f.rawValue]) }
        for b in c.benefitLabel { #expect(Formato.benefitLabel(b.entrada) == b.out) }
    }

    @Test func razones() {
        for r in c.reasonText { #expect(Formato.reasonText(r.reason) == r.out, "\(r.reason.code)") }
    }

    @Test func frenos() {
        for o in c.obstacleDetail { #expect(Formato.obstacleDetail(o.factor, o.evidence) == o.out, "\(o.factor) \(o.evidence)") }
    }

    @Test func nivelesYFechas() {
        for l in c.levelLabel { #expect(Formato.levelLabel(score: l.score, ready: l.ready) == l.out) }
        for w in c.weekLabel { #expect(Formato.weekLabel(w.entrada) == w.out) }
        for m in c.monthLabel { #expect(Formato.monthLabel(m.entrada) == m.out) }
    }

    @Test func montosEscritos() {
        for p in c.parseAmount { #expect(Formato.parseAmount(p.entrada) == p.out, "parseAmount(\(p.entrada))") }
    }

    @Test func sugerencias() {
        for s in c.suggestions {
            let goals = s.goals.enumerated().map { i, g in GoalView(id: "g\(i)", type: g.type, priority: g.priority) }
            #expect(ChatLogic.suggestions(goals: goals, hasProfile: s.hasProfile) == s.out)
        }
    }

    @Test func tarjetasDelChat() throws {
        for t in c.attachmentCard {
            let card = try #require(ChatLogic.card(t.attachment))
            #expect(card.title == t.out.title)
            #expect(card.detail == t.out.detail)
            #expect(card.destino.href == t.out.href)
            #expect(card.goalId == t.out.goalId)
        }
    }
}
