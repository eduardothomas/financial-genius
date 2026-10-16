import SwiftUI
import FinancialGeniusCore

/// Nivel de preparación como una esclusa que se llena: el agua sube hasta el puntaje
/// y la línea marca desde dónde ya conviene comparar.
struct EsclusaNivel: View {
    let score: Double
    let umbral: Double
    let etiqueta: String
    @State private var nivel: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .center, spacing: 22) {
            CamaraEsclusa(nivel: nivel / 100, umbral: umbral / 100)
                .frame(width: 92, height: 148)
            VStack(alignment: .leading, spacing: 2) {
                Text(JS.numberToString(JS.round(score)))
                    .font(.system(size: 64, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: score))
                    .foregroundStyle(Color.esclusa)
                Text("de 100")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(etiqueta)
                    .font(.title3.weight(.semibold))
                    .padding(.top, 6)
            }
            Spacer(minLength: 0)
        }
        .superficie(radio: 30)
        .onAppear { llenar() }
        .onChange(of: score) { llenar() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preparación: \(JS.numberToString(JS.round(score))) de 100. \(etiqueta)")
    }

    private func llenar() {
        withAnimation(reduceMotion ? nil : Animation.spring(duration: 1.4, bounce: 0.15)) { nivel = score }
    }
}

struct CamaraEsclusa: View {
    var nivel: Double
    var umbral: Double
    var trazo: CGFloat = 3
    var radio: CGFloat = 16
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: radio).fill(Color.esclusa.opacity(0.08))
                TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { t in
                    Ola(nivel: nivel, fase: reduceMotion ? 0 : t.date.timeIntervalSinceReferenceDate)
                        .fill(LinearGradient(colors: [Color.agua, Color.aguaProfunda], startPoint: .top, endPoint: .bottom))
                }
                Rectangle()
                    .fill(Color.esclusa.opacity(0.7))
                    .frame(height: 2)
                    .padding(.horizontal, 6)
                    .offset(y: -geo.size.height * umbral)
            }
            .clipShape(.rect(cornerRadius: radio))
            .overlay(RoundedRectangle(cornerRadius: radio).strokeBorder(Color.esclusa, lineWidth: trazo))
        }
    }
}

/// Superficie del agua con una ola suave. `nivel` es animable.
struct Ola: Shape {
    var nivel: Double
    var fase: Double

    var animatableData: Double {
        get { nivel }
        set { nivel = newValue }
    }

    func path(in r: CGRect) -> Path {
        let n = min(max(nivel, 0), 1)
        let base = r.maxY - r.height * CGFloat(n)
        let amplitud = n > 0.01 && n < 0.99 ? min(4, r.height * 0.03) : 0
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        var x: CGFloat = 0
        while x <= r.width {
            let onda = sin(Double(x / max(r.width, 1)) * 2 * Double.pi + fase * 2)
            let y = base + CGFloat(onda) * amplitud
            p.addLine(to: CGPoint(x: r.minX + x, y: y))
            x += 2
        }
        p.addLine(to: CGPoint(x: r.maxX, y: base))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

/// Versión mini para las filas de metas.
struct MiniEsclusa: View {
    let score: Double?

    var body: some View {
        CamaraEsclusa(nivel: (score ?? 0) / 100, umbral: 0.7, trazo: 2, radio: 4)
            .frame(width: 16, height: 44)
            .accessibilityHidden(true)
    }
}
