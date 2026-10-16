import Foundation

// Modelos de la API v1 (ver services/api y packages/contracts). Los códigos del motor
// llegan como texto: un valor nuevo del servidor nunca rompe la decodificación.

public enum GoalType: String, Codable, Sendable, CaseIterable, Identifiable {
    case creditCard = "credit_card"
    case autoLoan = "auto_loan"
    case mortgage
    public var id: String { rawValue }
}

public enum FactorId: String, Codable, Sendable, CaseIterable {
    case income, dti, employment, apc
    case downPayment = "down_payment"
    case utilization, documents
}

public enum EmploymentType: String, Codable, Sendable, CaseIterable, Identifiable {
    case salaried
    case selfEmployed = "self_employed"
    case informal, retired
    public var id: String { rawValue }
}

public enum Residency: String, Codable, Sendable, CaseIterable, Identifiable {
    case national, resident, foreign
    public var id: String { rawValue }
}

public enum ApcSelfReported: String, Codable, Sendable, CaseIterable, Identifiable {
    case good, fair, poor, none, unknown
    public var id: String { rawValue }
}

public enum DebtKind: String, Codable, Sendable, CaseIterable, Identifiable {
    case creditCard = "credit_card"
    case personalLoan = "personal_loan"
    case autoLoan = "auto_loan"
    case mortgage, other
    public var id: String { rawValue }
}

public enum ActionStatus: String, Codable, Sendable {
    case pending, done, skipped
}

public struct Me: Codable, Sendable, Equatable {
    public var id: String
    public var email: String
    public var plan: String
    public var hasSnapshot: Bool
    public var goals: Int
    enum CodingKeys: String, CodingKey {
        case id, email, plan, goals
        case hasSnapshot = "has_snapshot"
    }
}

public struct GoalView: Codable, Sendable, Equatable, Identifiable, Hashable {
    public var id: String
    public var type: GoalType
    public var priority: Int
    public var targetAmount: Double?
    public var desiredTermMonths: Int?
    public var preferences: [String]
    public var status: String
    public var createdAt: String
    public var readinessScore: Double?

    public init(id: String, type: GoalType, priority: Int, targetAmount: Double? = nil, desiredTermMonths: Int? = nil,
                preferences: [String] = [], status: String = "active", createdAt: String = "", readinessScore: Double? = nil) {
        self.id = id
        self.type = type
        self.priority = priority
        self.targetAmount = targetAmount
        self.desiredTermMonths = desiredTermMonths
        self.preferences = preferences
        self.status = status
        self.createdAt = createdAt
        self.readinessScore = readinessScore
    }
}

public struct GoalInput: Codable, Sendable, Equatable {
    public var type: GoalType
    public var priority: Int
    public var targetAmount: Double?
    public var desiredTermMonths: Int?
    public var preferences: [String]
    public init(type: GoalType, priority: Int, targetAmount: Double? = nil, desiredTermMonths: Int? = nil, preferences: [String] = []) {
        self.type = type
        self.priority = priority
        self.targetAmount = targetAmount
        self.desiredTermMonths = desiredTermMonths
        self.preferences = preferences
    }
}

public struct Debt: Codable, Sendable, Equatable {
    public var kind: DebtKind
    public var institution: String?
    public var balance: Double
    public var limit: Double?
    public var monthlyPayment: Double
    public var latePaymentsLast12m: Int?
    public init(kind: DebtKind, institution: String? = nil, balance: Double, limit: Double? = nil, monthlyPayment: Double, latePaymentsLast12m: Int? = nil) {
        self.kind = kind
        self.institution = institution
        self.balance = balance
        self.limit = limit
        self.monthlyPayment = monthlyPayment
        self.latePaymentsLast12m = latePaymentsLast12m
    }
}

public struct Documents: Codable, Sendable, Equatable {
    public var incomeProof: Bool
    public var employmentLetter: Bool
    public var apcReport: Bool
    public init(incomeProof: Bool = false, employmentLetter: Bool = false, apcReport: Bool = false) {
        self.incomeProof = incomeProof
        self.employmentLetter = employmentLetter
        self.apcReport = apcReport
    }
}

/// Perfil financiero (FinancialSnapshot del motor; también es el cuerpo de POST /v1/me/snapshot).
public struct FinancialSnapshot: Codable, Sendable, Equatable {
    public var netMonthlyIncome: Double
    public var employmentType: EmploymentType
    public var employmentMonths: Int
    public var fixedMonthlyExpenses: Double
    public var dependents: Int
    public var age: Int
    public var residency: Residency
    public var apcSelfReported: ApcSelfReported
    public var debts: [Debt]
    public var savingsForDownPayment: Double
    public var documents: Documents
    public var fieldSources: [String: String]?

    public init(netMonthlyIncome: Double, employmentType: EmploymentType, employmentMonths: Int, fixedMonthlyExpenses: Double,
                dependents: Int, age: Int, residency: Residency, apcSelfReported: ApcSelfReported, debts: [Debt],
                savingsForDownPayment: Double, documents: Documents, fieldSources: [String: String]? = nil) {
        self.netMonthlyIncome = netMonthlyIncome
        self.employmentType = employmentType
        self.employmentMonths = employmentMonths
        self.fixedMonthlyExpenses = fixedMonthlyExpenses
        self.dependents = dependents
        self.age = age
        self.residency = residency
        self.apcSelfReported = apcSelfReported
        self.debts = debts
        self.savingsForDownPayment = savingsForDownPayment
        self.documents = documents
        self.fieldSources = fieldSources
    }
}

public struct SnapshotRecord: Codable, Sendable {
    public var id: String
    public var createdAt: String
    public var snapshot: FinancialSnapshot
}

public struct FactorResult: Codable, Sendable, Equatable {
    public var factor: String
    public var score: Double
    public var weight: Double
    public var evidence: [String: JSONValue]
}

public struct Obstacle: Codable, Sendable, Equatable, Identifiable {
    public var factor: String
    public var impactPoints: Double
    public var blocking: Bool
    public var evidence: [String: JSONValue]
    public var suggestedActions: [String]
    public var id: String { factor }
}

public struct ReadinessView: Codable, Sendable, Equatable {
    public var goalId: String
    public var goalType: GoalType
    public var score: Double
    public var readyToCompare: Bool
    public var factors: [FactorResult]
    public var obstacles: [Obstacle]
    public var weightsVersion: String
    public var snapshotDate: String
}

public struct Reason: Codable, Sendable, Equatable {
    public var code: String
    public var params: [String: JSONValue]
    public init(code: String, params: [String: JSONValue] = [:]) {
        self.code = code
        self.params = params
    }
}

public struct ProductSource: Codable, Sendable, Equatable {
    public var url: String
    public var capturedAt: String
}

public struct RankedProduct: Codable, Sendable, Equatable, Identifiable {
    public var position: Int
    public var productId: String
    public var institutionName: String
    public var name: String
    public var score: Double
    public var estimatedMonthlyPayment: Double?
    public var reasons: [Reason]
    public var assumptions: [String]
    public var source: ProductSource
    public var id: String { productId }
}

public struct ExcludedProduct: Codable, Sendable, Equatable {
    public var productId: String
    public var failed: [String]
}

public struct RecommendationsView: Codable, Sendable, Equatable {
    public var goalId: String
    public var top: [RankedProduct]
    public var eligibleCount: Int
    public var consideredCount: Int
    public var excluded: [ExcludedProduct]
    public var readyToCompare: Bool
    public var notice: String?
}

public struct PlanAction: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var weekStart: String
    public var status: ActionStatus
    public var factor: String?
    public var result: String?
}

public struct PlanView: Codable, Sendable, Equatable {
    public var id: String
    public var month: String
    public var objective: String
    public var actions: [PlanAction]
}

// MARK: - Chat

public struct RankingEntry: Codable, Sendable, Equatable {
    public var position: Int
    public var productId: String
    public var name: String
    public var institutionName: String
    public var estimatedMonthlyPayment: Double?
}

/// Tarjetas que el Genio adjunta a sus respuestas (services/api/src/chat/tools.ts).
public enum ChatAttachment: Codable, Sendable, Equatable {
    case readiness(goalId: String, goalType: GoalType, score: Double, ready: Bool)
    case ranking(goalId: String, readyToCompare: Bool, top: [RankingEntry])
    case plan(goalId: String, objective: String, done: Int, total: Int)
    case goal(goalId: String, goalType: GoalType, priority: Int, targetAmount: Double?)
    /// Tipo nuevo que esta versión de la app aún no sabe dibujar.
    case unknown(String)

    enum CodingKeys: String, CodingKey {
        case type, goalId, goalType, score, ready, readyToCompare, top, objective, done, total, priority, targetAmount
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "readiness":
            self = .readiness(goalId: try c.decode(String.self, forKey: .goalId), goalType: try c.decode(GoalType.self, forKey: .goalType),
                              score: try c.decode(Double.self, forKey: .score), ready: try c.decode(Bool.self, forKey: .ready))
        case "ranking":
            self = .ranking(goalId: try c.decode(String.self, forKey: .goalId), readyToCompare: try c.decode(Bool.self, forKey: .readyToCompare),
                            top: try c.decode([RankingEntry].self, forKey: .top))
        case "plan":
            self = .plan(goalId: try c.decode(String.self, forKey: .goalId), objective: try c.decode(String.self, forKey: .objective),
                         done: try c.decode(Int.self, forKey: .done), total: try c.decode(Int.self, forKey: .total))
        case "goal":
            self = .goal(goalId: try c.decode(String.self, forKey: .goalId), goalType: try c.decode(GoalType.self, forKey: .goalType),
                         priority: try c.decode(Int.self, forKey: .priority), targetAmount: try c.decodeIfPresent(Double.self, forKey: .targetAmount))
        default:
            self = .unknown(type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .readiness(goalId, goalType, score, ready):
            try c.encode("readiness", forKey: .type)
            try c.encode(goalId, forKey: .goalId)
            try c.encode(goalType, forKey: .goalType)
            try c.encode(score, forKey: .score)
            try c.encode(ready, forKey: .ready)
        case let .ranking(goalId, readyToCompare, top):
            try c.encode("ranking", forKey: .type)
            try c.encode(goalId, forKey: .goalId)
            try c.encode(readyToCompare, forKey: .readyToCompare)
            try c.encode(top, forKey: .top)
        case let .plan(goalId, objective, done, total):
            try c.encode("plan", forKey: .type)
            try c.encode(goalId, forKey: .goalId)
            try c.encode(objective, forKey: .objective)
            try c.encode(done, forKey: .done)
            try c.encode(total, forKey: .total)
        case let .goal(goalId, goalType, priority, targetAmount):
            try c.encode("goal", forKey: .type)
            try c.encode(goalId, forKey: .goalId)
            try c.encode(goalType, forKey: .goalType)
            try c.encode(priority, forKey: .priority)
            try c.encode(targetAmount, forKey: .targetAmount)
        case let .unknown(type):
            try c.encode(type, forKey: .type)
        }
    }
}

public enum ChatRole: String, Codable, Sendable {
    case user, assistant
}

public struct ChatMessage: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var role: ChatRole
    public var content: String
    public var attachments: [ChatAttachment]
    public var createdAt: String
    public init(id: String, role: ChatRole, content: String, attachments: [ChatAttachment] = [], createdAt: String = "") {
        self.id = id
        self.role = role
        self.content = content
        self.attachments = attachments
        self.createdAt = createdAt
    }
}

public struct ChatReply: Codable, Sendable, Equatable {
    public var conversationId: String
    public var messageId: String
    public var reply: String
    public var attachments: [ChatAttachment]
}

public struct ConversationSummary: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var createdAt: String
    public var lastMessageAt: String?
    public var preview: String?
}
