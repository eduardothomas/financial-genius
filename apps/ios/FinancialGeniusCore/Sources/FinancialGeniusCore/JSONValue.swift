import Foundation

/// Valor JSON libre (evidencia de los frenos, parámetros de las razones).
/// Se comporta como JavaScript al convertirse a texto o número, para que los textos
/// salgan idénticos a los de la app TypeScript (ver casos dorados).
public enum JSONValue: Codable, Sendable, Equatable, Hashable {
    case number(Double)
    case string(String)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    /// `Number(v)` de JavaScript (null → 0, texto → su número o NaN).
    public var jsNumber: Double {
        switch self {
        case .number(let n): return n
        case .null: return 0
        case .bool(let b): return b ? 1 : 0
        case .string(let s):
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return 0 }
            return Double(t) ?? .nan
        case .array, .object: return .nan
        }
    }

    /// `String(v)` de JavaScript.
    public var jsString: String {
        switch self {
        case .number(let n): return JS.numberToString(n)
        case .string(let s): return s
        case .bool(let b): return b ? "true" : "false"
        case .null: return "null"
        case .array(let a): return a.map { $0 == .null ? "" : $0.jsString }.joined(separator: ",")
        case .object: return "[object Object]"
        }
    }

    public var isNull: Bool { self == .null }
}

extension Optional where Wrapped == JSONValue {
    /// `v != null` de JavaScript: ni ausente ni null.
    var isPresent: Bool {
        if case .some(let v) = self { return !v.isNull }
        return false
    }
    var jsString: String { self?.jsString ?? "undefined" }
    var jsNumber: Double { self?.jsNumber ?? .nan }
}

/// Conversiones numéricas idénticas a las de JavaScript.
public enum JS {
    /// `Number.prototype.toFixed(d)`: redondeo sobre la expansión decimal exacta del double;
    /// en empate exacto gana el mayor (como dice la especificación).
    public static func toFixed(_ x: Double, _ digits: Int) -> String {
        guard x.isFinite else { return x.isNaN ? "NaN" : (x < 0 ? "-Infinity" : "Infinity") }
        if x < 0 { return "-" + toFixed(-x, digits) }
        // printf imprime la expansión exacta del double (glibc y Darwin): 80 decimales sobran.
        let exact = String(format: "%.80f", x)
        let parts = exact.split(separator: ".", omittingEmptySubsequences: false)
        let intPart = Array(parts[0])
        let frac = parts.count > 1 ? Array(parts[1]) : []
        var digitsArr: [UInt8] = (intPart + frac.prefix(digits)).map { UInt8($0.asciiValue! - 48) }
        while digitsArr.count < intPart.count + digits { digitsArr.append(0) }
        let next = frac.count > digits ? Int(frac[digits].asciiValue! - 48) : 0
        var intCount = intPart.count
        if next >= 5 {
            var i = digitsArr.count - 1
            while i >= 0 {
                if digitsArr[i] == 9 {
                    digitsArr[i] = 0
                    i -= 1
                } else {
                    digitsArr[i] += 1
                    break
                }
            }
            if i < 0 {
                digitsArr.insert(1, at: 0)
                intCount += 1
            }
        }
        let s = digitsArr.map { String($0) }.joined()
        let intStr = String(s.prefix(intCount))
        let fracStr = String(s.dropFirst(intCount))
        return digits > 0 ? "\(intStr).\(fracStr)" : intStr
    }

    /// `String(n)` de JavaScript para los rangos que usa la app (sin ".0" en enteros).
    public static func numberToString(_ n: Double) -> String {
        if n.isNaN { return "NaN" }
        if n.isInfinite { return n < 0 ? "-Infinity" : "Infinity" }
        if n == n.rounded(), abs(n) < 1e21 {
            if n == 0 { return "0" }
            return String(format: "%.0f", n)
        }
        return "\(n)"
    }

    /// `Math.round` de JavaScript (empates hacia +∞).
    public static func round(_ n: Double) -> Double { (n + 0.5).rounded(.down) }
}
