import Foundation

/// Textos y formatos de la app (español de Panamá). Copia fiel de apps/app/src/lib/format.ts:
/// los casos dorados garantizan que ambas plataformas dicen exactamente lo mismo.
public enum Formato {
    /// B/. 1,234 o B/. 1,234.50 (balboa = dólar).
    public static func money(_ n: Double, decimals: Int = 0) -> String {
        let sign = n < 0 ? "-" : ""
        let fixed = JS.toFixed(abs(n), decimals)
        let parts = fixed.split(separator: ".", omittingEmptySubsequences: false)
        let int = String(parts[0])
        let dec = parts.count > 1 ? String(parts[1]) : ""
        return "\(sign)B/. \(group(int))\(dec.isEmpty ? "" : ".\(dec)")"
    }

    private static func group(_ digits: String) -> String {
        var out: [Character] = []
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0, i % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return String(out.reversed())
    }

    public static func pct(_ n: Double, decimals: Int = 1) -> String {
        let v = Double(JS.toFixed(n, decimals)) ?? n
        return "\(JS.numberToString(v))%"
    }

    public static func goalLabel(_ t: GoalType) -> String {
        switch t {
        case .creditCard: "Tarjeta de crédito"
        case .autoLoan: "Préstamo de auto"
        case .mortgage: "Comprar casa"
        }
    }

    public static func goalHint(_ t: GoalType) -> String {
        switch t {
        case .creditCard: "Tu primera tarjeta o una mejor que la que tienes"
        case .autoLoan: "Financiar un carro nuevo o usado"
        case .mortgage: "Hipoteca para tu vivienda"
        }
    }

    public static func factorLabel(_ f: FactorId) -> String {
        switch f {
        case .income: "Ingreso"
        case .dti: "Deudas frente a tu ingreso"
        case .employment: "Antigüedad laboral"
        case .apc: "Historial de crédito"
        case .downPayment: "Abono ahorrado"
        case .utilization: "Uso de tus tarjetas"
        case .documents: "Documentos"
        }
    }

    /// Para códigos que llegan del servidor como texto.
    public static func factorLabel(_ raw: String) -> String {
        FactorId(rawValue: raw).map { factorLabel($0) } ?? raw
    }

    /// Explicación corta de un freno a partir de su evidencia.
    public static func obstacleDetail(_ factor: FactorId, _ ev: [String: JSONValue]) -> String {
        switch factor {
        case .income:
            return ev["marketMin"].isPresent
                ? "Ganas \(money(ev["income"].jsNumber)) y el mínimo más bajo del mercado es \(money(ev["marketMin"].jsNumber))."
                : "Aún no hay suficientes productos para comparar tu ingreso."
        case .dti:
            return ev["dti"].isPresent
                ? "Con la nueva cuota, tus deudas serían el \(pct(ev["dti"].jsNumber * 100, decimals: 0)) de tu ingreso. Lo ideal es hasta \(pct(ev["dtiGood"].jsNumber * 100, decimals: 0))."
                : "No pudimos calcular tus deudas frente a tu ingreso."
        case .employment:
            return "Llevas \(ev["months"].jsString) meses en tu empleo; los bancos suelen pedir \(ev["target"].jsString)."
        case .apc:
            return apcText[ev["selfReported"].jsString] ?? "Revisa tu historial de crédito."
        case .downPayment:
            return ev["required"].isPresent
                ? "Tienes \(money(ev["saved"].jsNumber)) de \(money(ev["required"].jsNumber)) de abono (\(ev["pct"].jsString)%)."
                : "Indica el monto de tu meta para calcular el abono."
        case .utilization:
            return ev["utilization"].isPresent
                ? "Usas el \(pct(ev["utilization"].jsNumber * 100, decimals: 0)) del límite de tus tarjetas. Lo ideal es menos de \(pct(ev["good"].jsNumber * 100, decimals: 0))."
                : "No tienes tarjetas registradas."
        case .documents:
            return "Tienes \(ev["ready"].jsString) de \(ev["total"].jsString) documentos listos."
        }
    }

    public static func obstacleDetail(_ raw: String, _ ev: [String: JSONValue]) -> String {
        FactorId(rawValue: raw).map { obstacleDetail($0, ev) } ?? ""
    }

    private static let apcText: [String: String] = [
        "good": "Dices que tu historial es bueno.",
        "fair": "Dices que tu historial tiene algunos atrasos.",
        "poor": "Dices que tu historial tiene problemas.",
        "none": "Dices que aún no tienes historial de crédito.",
        "unknown": "No sabemos cómo está tu historial de crédito.",
    ]

    /// Razón estructurada del ranking → frase. El texto nunca agrega datos que no vengan en la razón.
    public static func reasonText(_ r: Reason) -> String {
        let p = r.params
        switch r.code {
        case "lowest_cost":
            return "El costo más bajo de \(p["compared"].jsString) opciones que calificas"
        case "low_cost":
            return "De las más baratas para tu caso"
        case "no_annual_fee":
            return "Sin anualidad"
        case "matches_preferences":
            let list = p["benefits"].jsString.split(separator: ",", omittingEmptySubsequences: false).map { benefitLabel(String($0)) }
            return "Tiene lo que buscas: \(list.joined(separator: ", "))"
        case "affordable_payment":
            return "Cuota estimada de \(money(p["payment"].jsNumber)), cómoda para tu capacidad de \(money(p["capacity"].jsNumber))"
        case "tight_payment":
            return "Cuota estimada de \(money(p["payment"].jsNumber)): queda justa frente a tu capacidad de \(money(p["capacity"].jsNumber))"
        case "comfortable_requirements":
            return "Cumples con holgura el ingreso mínimo de \(money(p["minIncome"].jsNumber))"
        case "tight_requirements":
            return "Cumples justo el ingreso mínimo de \(money(p["minIncome"].jsNumber))"
        case "higher_down_payment":
            return "Pide \(p["pct"].jsString)% de abono (otras opciones piden \(p["lowest"].jsString)%): cuota más baja, pero necesitas más ahorro"
        default:
            return ""
        }
    }

    private static let benefits: [String: String] = [
        "cashback": "reembolso en efectivo",
        "miles": "millas",
        "points": "puntos",
        "lounge": "salas VIP",
        "insurance_included": "seguro incluido",
        "discounts": "descuentos",
        "secured": "tarjeta asegurada",
    ]

    public static func benefitLabel(_ b: String) -> String { benefits[b] ?? b }

    /// Nivel de preparación en palabras.
    public static func levelLabel(score: Double, ready: Bool) -> String {
        if ready { return "Listo para comparar" }
        if score >= 70 { return "Casi listo" }
        if score >= 40 { return "En camino" }
        return "Empezando"
    }

    private static let months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    /// "2026-10-12" → "semana del 12 de octubre"
    public static func weekLabel(_ isoDate: String) -> String {
        let parts = isoDate.split(separator: "-").map { Int($0) }
        let m = parts.count > 1 ? (parts[1] ?? 1) : 1
        let d = parts.count > 2 ? parts[2].map { String($0) } ?? "NaN" : "undefined"
        let month = (1...12).contains(m) ? months[m - 1] : "undefined"
        return "semana del \(d) de \(month)"
    }

    /// "2026-10-01" → "octubre"
    public static func monthLabel(_ isoDate: String) -> String {
        let chars = Array(isoDate)
        guard chars.count >= 7, let m = Int(String(chars[5...6])), (1...12).contains(m) else { return "" }
        return months[m - 1]
    }

    /// Lee un número escrito por el usuario: "1,250.50", "B/. 900", "900" → número; vacío o inválido → nil.
    public static func parseAmount(_ s: String) -> Double? {
        let noPrefix = s.replacingOccurrences(of: "b/.", with: "", options: .caseInsensitive)
        let clean = String(noPrefix.filter { $0 != "$" && $0 != "," && !$0.isWhitespace })
        if clean.isEmpty { return nil }
        guard let n = Double(clean), n.isFinite, n >= 0 else { return nil }
        return n
    }
}
