import SwiftUI
import FinancialGeniusCore

/// Hoja para crear una meta.
struct NuevaMetaPantalla: View {
    let cantidadMetas: Int
    let alGuardar: (GoalView) -> Void
    @Environment(Sesion.self) private var sesion
    @Environment(\.dismiss) private var cerrar
    @State private var tipo: GoalType = .creditCard
    @State private var monto = ""
    @State private var plazo = ""
    @State private var preferencias: Set<String> = []
    @State private var ocupado = false
    @State private var error: String?

    private struct Opcion: Identifiable {
        let valor: String
        let etiqueta: String
        var id: String { valor }
    }

    private static let opciones = [
        Opcion(valor: "cashback", etiqueta: "Reembolso en efectivo"),
        Opcion(valor: "miles", etiqueta: "Millas"),
        Opcion(valor: "points", etiqueta: "Puntos"),
        Opcion(valor: "secured", etiqueta: "Tarjeta asegurada (sin historial)"),
    ]

    private var esPrestamo: Bool { tipo != .creditCard }
    private var montoN: Double? { Formato.parseAmount(monto) }
    private var plazoN: Int? { Int(plazo.trimmingCharacters(in: .whitespaces)) }
    private var errorMonto: String? { esPrestamo && !monto.isEmpty && montoN == nil ? "Escribe un monto, por ejemplo 25,000" : nil }
    private var errorPlazo: String? {
        guard !plazo.isEmpty else { return nil }
        guard let n = plazoN, (1...480).contains(n) else { return "Entre 1 y 480 meses" }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("¿Qué quieres lograr?", selection: $tipo) {
                        ForEach(GoalType.allCases) { t in Text(Formato.goalLabel(t)).tag(t) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text("¿Qué quieres lograr?")
                } footer: {
                    Text("\(Formato.goalHint(tipo)).")
                }

                if esPrestamo {
                    Section {
                        TextField(tipo == .mortgage ? "150,000" : "25,000", text: $monto)
                            .keyboardType(.decimalPad)
                        if let errorMonto { Text(errorMonto).font(.footnote).foregroundStyle(Color.alerta) }
                    } header: {
                        Text(tipo == .mortgage ? "Precio de la casa" : "Precio del carro")
                    } footer: {
                        Text("Aproximado. Lo usamos para calcular tu cuota y el abono.")
                    }
                    Section("Plazo en meses (opcional)") {
                        TextField(tipo == .mortgage ? "360" : "72", text: $plazo)
                            .keyboardType(.numberPad)
                        if let errorPlazo { Text(errorPlazo).font(.footnote).foregroundStyle(Color.alerta) }
                    }
                } else {
                    Section("¿Qué te importa en una tarjeta? (opcional)") {
                        ForEach(Self.opciones) { o in
                            Toggle(o.etiqueta, isOn: Binding(
                                get: { preferencias.contains(o.valor) },
                                set: { if $0 { preferencias.insert(o.valor) } else { preferencias.remove(o.valor) } }))
                        }
                    }
                }

                if let error {
                    Section { Aviso(error, tono: .error) }
                }
            }
            .animation(.snappy, value: tipo)
            .navigationTitle("Nueva meta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", systemImage: "xmark") { cerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if ocupado {
                        ProgressView()
                    } else {
                        Button("Guardar meta", systemImage: "checkmark") { guardar() }
                            .disabled(errorMonto != nil || errorPlazo != nil)
                    }
                }
            }
        }
    }

    private func guardar() {
        ocupado = true
        error = nil
        let entrada = GoalInput(
            type: tipo,
            priority: min(cantidadMetas + 1, 10),
            targetAmount: esPrestamo ? montoN.flatMap { $0 > 0 ? $0 : nil } : nil,
            desiredTermMonths: esPrestamo ? plazoN : nil,
            preferences: tipo == .creditCard ? Self.opciones.map(\.valor).filter { preferencias.contains($0) } : [])
        Task {
            do {
                let g = try await sesion.api.createGoal(entrada)
                cerrar()
                alGuardar(g)
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos guardar la meta."
                ocupado = false
            }
        }
    }
}
