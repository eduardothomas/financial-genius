import Foundation

/// A dónde lleva una tarjeta del chat.
public enum Destino: Equatable, Sendable, Hashable {
    case productos
    case plan
    case meta(String)

    /// Igual que el `href` de la app TypeScript (para los casos dorados).
    public var href: String {
        switch self {
        case .productos: "/productos"
        case .plan: "/plan"
        case .meta(let id): "/meta/\(id)"
        }
    }
}

public struct CardView: Equatable, Sendable {
    public var title: String
    public var detail: String
    public var destino: Destino
    public var goalId: String
}

/// Lógica pura del chat del Genio (copia de apps/app/src/lib/chat.ts).
public enum ChatLogic {
    /// Preguntas rápidas según lo que el usuario ya tiene. Máximo 3.
    public static func suggestions(goals: [GoalView]?, hasProfile: Bool) -> [String] {
        guard let goals, let main = goals.min(by: { $0.priority < $1.priority }) else {
            return ["Quiero mi primera tarjeta de crédito", "Quiero comprar un carro", "Quiero comprar una casa"]
        }
        let what = Formato.goalLabel(main.type).lowercased()
        let ready: String
        switch main.type {
        case .mortgage: ready = "comprar casa"
        case .autoLoan: ready = "el préstamo de auto"
        case .creditCard: ready = "una tarjeta"
        }
        return [
            "¿Estoy listo para \(ready)?",
            "¿Qué hago esta semana?",
            hasProfile ? "¿Cuáles son mis mejores opciones de \(what)?" : "¿Qué datos necesitas de mí?",
        ]
    }

    /// nil para tipos de tarjeta que esta versión no conoce.
    public static func card(_ a: ChatAttachment) -> CardView? {
        switch a {
        case let .readiness(goalId, goalType, score, ready):
            return CardView(
                title: "\(Formato.goalLabel(goalType)): \(JS.numberToString(JS.round(score))) de 100",
                detail: ready ? "Listo para comparar opciones" : "Aún no: mira tus frenos",
                destino: .meta(goalId), goalId: goalId)
        case let .ranking(goalId, _, top):
            guard let first = top.first else {
                return CardView(title: "Sin opciones por ahora", detail: "Hoy no cumples los requisitos públicos de ningún producto",
                                destino: .productos, goalId: goalId)
            }
            let pay = first.estimatedMonthlyPayment.map { " · \(Formato.money($0)) al mes aprox." } ?? ""
            return CardView(title: "#1 \(first.name)", detail: "\(first.institutionName)\(pay) · ver las \(top.count)",
                            destino: .productos, goalId: goalId)
        case let .plan(goalId, objective, done, total):
            return CardView(title: objective, detail: "Plan del mes: \(done) de \(total) misiones hechas", destino: .plan, goalId: goalId)
        case let .goal(goalId, goalType, priority, targetAmount):
            let amount = targetAmount.flatMap { $0 != 0 ? " · \(Formato.money($0))" : nil } ?? ""
            return CardView(title: "Nueva meta: \(Formato.goalLabel(goalType))", detail: "Prioridad \(priority)\(amount)",
                            destino: .meta(goalId), goalId: goalId)
        case .unknown:
            return nil
        }
    }
}
