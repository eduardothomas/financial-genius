import SwiftUI
import FinancialGeniusCore

// Motivo de diseño: la esclusa del Canal. Azul profundo de esclusa, agua (mango) que sube con la preparación.
// Colores adaptados a modo oscuro. Liquid Glass para la capa de controles y navegación; el contenido va en superficies sólidas.

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension Color {
    init(claro: UInt32, oscuro: UInt32) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: oscuro) : UIColor(hex: claro) })
    }

    /// Azul de esclusa: texto de marca, trazos.
    static let esclusa = Color(claro: 0x0E3B43, oscuro: 0x7FC8C9)
    /// Relleno de marca con texto blanco encima.
    static let esclusaFuerte = Color(claro: 0x0E3B43, oscuro: 0x1F5C66)
    /// Mango: el nivel de preparación.
    static let agua = Color(claro: 0xF2A541, oscuro: 0xF2A541)
    static let aguaProfunda = Color(claro: 0xC77D12, oscuro: 0xF5B95F)
    static let bien = Color(claro: 0x2F7D5B, oscuro: 0x5FC08F)
    static let alerta = Color(claro: 0xA3302A, oscuro: 0xFF8A80)
}

extension View {
    /// Botón Liquid Glass: prominente (acción principal) o normal.
    @ViewBuilder
    func botonGlass(prominente: Bool) -> some View {
        if prominente {
            buttonStyle(.glassProminent)
        } else {
            buttonStyle(.glass)
        }
    }

    /// Superficie sólida para contenido (tarjetas de productos, frenos).
    func superficie(radio: CGFloat = 24) -> some View {
        padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: .rect(cornerRadius: radio))
    }
}

/// Aviso en línea (informativo o de error).
struct Aviso: View {
    enum Tono { case info, error }
    let texto: String
    var tono: Tono = .info

    init(_ texto: String, tono: Tono = .info) {
        self.texto = texto
        self.tono = tono
    }

    var body: some View {
        let color = tono == .error ? Color.alerta : Color.aguaProfunda
        Label {
            Text(texto).foregroundStyle(.primary)
        } icon: {
            Image(systemName: tono == .error ? "exclamationmark.triangle.fill" : "info.circle.fill").foregroundStyle(color)
        }
        .font(.subheadline)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.12), in: .rect(cornerRadius: 16))
    }
}

/// Elige la meta para Plan y Productos (chips de Liquid Glass). Solo aparece con 2 metas o más.
struct SelectorDeMeta: View {
    let metas: [GoalView]
    @Binding var seleccion: String?

    var body: some View {
        if metas.count >= 2 {
            ScrollView(.horizontal) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(metas) { g in
                            let activa = g.id == seleccion
                            Button(Formato.goalLabel(g.type)) {
                                withAnimation(.snappy) { seleccion = g.id }
                            }
                            .botonGlass(prominente: activa)
                            .accessibilityIdentifier("meta-chip-\(g.type.rawValue)")
                            .accessibilityAddTraits(activa ? .isSelected : [])
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                }
            }
            .scrollIndicators(.hidden)
            .sensoryFeedback(.selection, trigger: seleccion)
        }
    }
}

/// Elige por defecto la meta de mayor prioridad si la elegida ya no existe.
@MainActor
func asegurarMeta(_ metas: [GoalView], en sesion: Sesion) {
    if !metas.contains(where: { $0.id == sesion.metaId }) { sesion.metaId = metas.first?.id }
}
