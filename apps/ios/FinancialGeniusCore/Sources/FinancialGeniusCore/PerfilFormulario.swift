import Foundation

/// Formulario de perfil ↔ FinancialSnapshot. Puro y probado: la pantalla solo lo muestra.
/// Mismas reglas que packages/contracts (SnapshotInputSchema) y que apps/app/src/lib/profileForm.ts.
public struct DebtForm: Equatable, Sendable, Identifiable {
    public var id = UUID()
    public var kind: DebtKind
    public var balance: String
    public var limit: String
    public var monthlyPayment: String
    public init(kind: DebtKind = .creditCard, balance: String = "", limit: String = "", monthlyPayment: String = "") {
        self.kind = kind
        self.balance = balance
        self.limit = limit
        self.monthlyPayment = monthlyPayment
    }
}

public struct ProfileForm: Equatable, Sendable {
    public var netMonthlyIncome = ""
    public var employmentType: EmploymentType = .salaried
    public var employmentMonths = ""
    public var fixedMonthlyExpenses = ""
    public var dependents = "0"
    public var age = ""
    public var residency: Residency = .national
    public var apcSelfReported: ApcSelfReported = .unknown
    public var savingsForDownPayment = ""
    public var documents = Documents()
    public var debts: [DebtForm] = []

    public init() {}

    public init(snapshot s: FinancialSnapshot) {
        netMonthlyIncome = JS.numberToString(s.netMonthlyIncome)
        employmentType = s.employmentType
        employmentMonths = String(s.employmentMonths)
        fixedMonthlyExpenses = JS.numberToString(s.fixedMonthlyExpenses)
        dependents = String(s.dependents)
        age = String(s.age)
        residency = s.residency
        apcSelfReported = s.apcSelfReported
        savingsForDownPayment = JS.numberToString(s.savingsForDownPayment)
        documents = s.documents
        debts = s.debts.map {
            DebtForm(kind: $0.kind, balance: JS.numberToString($0.balance), limit: $0.limit.map(JS.numberToString) ?? "",
                     monthlyPayment: JS.numberToString($0.monthlyPayment))
        }
    }

    public enum Resultado: Equatable, Sendable {
        case ok(FinancialSnapshot)
        case errores([String: String])
    }

    static let maxMoney = 10_000_000.0

    /// Valida igual que la API. Devuelve el perfil o errores por campo (claves como en TypeScript: "debts.0.limit").
    public func validar() -> Resultado {
        var errors: [String: String] = [:]
        func set(_ key: String, _ msg: String) {
            if errors[key] == nil { errors[key] = msg }
        }
        func amount(_ key: String, _ v: String, required: Bool) -> Double {
            let trimmed = v.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let n = Formato.parseAmount(v) else {
                if required || !trimmed.isEmpty { set(key, required && trimmed.isEmpty ? "Requerido" : "Escribe un monto válido") }
                return 0
            }
            if n > Self.maxMoney { set(key, "Revisa este dato") }
            return n
        }
        func int(_ key: String, _ v: String, min: Int, max: Int, message: String, empty: Int? = nil) -> Int {
            let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty, let empty { return empty }
            guard !t.isEmpty, t.allSatisfy({ $0.isASCII && $0.isNumber }), let n = Int(t), n >= min, n <= max else {
                set(key, message)
                return 0
            }
            return n
        }

        let income = amount("netMonthlyIncome", netMonthlyIncome, required: true)
        let fixed = amount("fixedMonthlyExpenses", fixedMonthlyExpenses, required: false)
        let savings = amount("savingsForDownPayment", savingsForDownPayment, required: false)
        let debtsOut: [Debt] = debts.enumerated().map { i, d in
            let balance = amount("debts.\(i).balance", d.balance, required: true)
            let limit = d.kind == .creditCard ? amount("debts.\(i).limit", d.limit, required: true) : nil
            let payment = amount("debts.\(i).monthlyPayment", d.monthlyPayment, required: true)
            return Debt(kind: d.kind, balance: balance, limit: limit, monthlyPayment: payment)
        }
        let months = int("employmentMonths", employmentMonths, min: 0, max: 720, message: "Escribe los meses, por ejemplo 18")
        let deps = int("dependents", dependents, min: 0, max: 20, message: "Escribe un número, por ejemplo 0", empty: 0)
        let ageN = int("age", age, min: 16, max: 120, message: "Escribe tu edad (16 o más)")
        if debts.count > 30 { set("debts", "Revisa este dato") }

        if !errors.isEmpty { return .errores(errors) }
        return .ok(FinancialSnapshot(
            netMonthlyIncome: income, employmentType: employmentType, employmentMonths: months, fixedMonthlyExpenses: fixed,
            dependents: deps, age: ageN, residency: residency, apcSelfReported: apcSelfReported, debts: debtsOut,
            savingsForDownPayment: savings, documents: documents, fieldSources: [:]))
    }
}
