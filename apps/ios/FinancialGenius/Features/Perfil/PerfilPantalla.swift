import SwiftUI
import FinancialGeniusCore

/// Perfil financiero. Cada vez que se guarda se crea un snapshot nuevo y las metas se recalculan.
struct PerfilPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var form = ProfileForm()
    @State private var errores: [String: String] = [:]
    @State private var cargado = false
    @State private var ocupado = false
    @State private var guardado = false
    @State private var errorGuardar: String?
    @State private var confirmarBorrado = false
    @State private var borrando = false

    private static func etiqueta(_ k: DebtKind) -> String {
        switch k {
        case .creditCard: "Tarjeta"
        case .personalLoan: "Préstamo personal"
        case .autoLoan: "Auto"
        case .mortgage: "Hipoteca"
        case .other: "Otra"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Con esto calculamos qué tan cerca estás de cada meta. Cada vez que guardas, recalculamos.")
                        .foregroundStyle(.secondary)
                }
                ingresos
                historial
                deudas
                documentos
                guardar
                cuenta
            }
            .scrollDismissesKeyboard(.interactively)
            .overlay { if !cargado { ProgressView() } }
            .navigationTitle("Tu perfil financiero")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Guardar", systemImage: "checkmark") { guardarPerfil() }
                        .disabled(ocupado)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Listo") { ocultarTeclado() }
                }
            }
            .onChange(of: form) { guardado = false }
            .sensoryFeedback(.success, trigger: guardado) { _, ahora in ahora }
            .task { await cargar() }
        }
    }

    // MARK: Secciones

    private var ingresos: some View {
        Section("Ingresos y trabajo") {
            Campo(titulo: "Ingreso neto mensual", ayuda: "Lo que te llega después de descuentos", texto: $form.netMonthlyIncome,
                  ejemplo: "1,500", error: errores["netMonthlyIncome"])
            Picker("Tipo de empleo", selection: $form.employmentType) {
                Text("Asalariado").tag(EmploymentType.salaried)
                Text("Independiente").tag(EmploymentType.selfEmployed)
                Text("Informal").tag(EmploymentType.informal)
                Text("Jubilado").tag(EmploymentType.retired)
            }
            Campo(titulo: "Meses en tu empleo actual", texto: $form.employmentMonths, ejemplo: "18", teclado: .numberPad,
                  error: errores["employmentMonths"])
            Campo(titulo: "Gastos fijos mensuales", ayuda: "Alquiler, servicios, colegios. Sin contar deudas.",
                  texto: $form.fixedMonthlyExpenses, ejemplo: "600", error: errores["fixedMonthlyExpenses"])
            Campo(titulo: "Edad", texto: $form.age, ejemplo: "30", teclado: .numberPad, error: errores["age"])
            Campo(titulo: "Dependientes", texto: $form.dependents, ejemplo: "0", teclado: .numberPad, error: errores["dependents"])
            Picker("Residencia", selection: $form.residency) {
                Text("Panameño").tag(Residency.national)
                Text("Residente").tag(Residency.resident)
                Text("Extranjero").tag(Residency.foreign)
            }
        }
    }

    private var historial: some View {
        Section("Historial y ahorro") {
            Picker("¿Cómo está tu historial de crédito (APC)?", selection: $form.apcSelfReported) {
                Text("Bueno").tag(ApcSelfReported.good)
                Text("Algún atraso").tag(ApcSelfReported.fair)
                Text("Con problemas").tag(ApcSelfReported.poor)
                Text("No tengo").tag(ApcSelfReported.none)
                Text("No sé").tag(ApcSelfReported.unknown)
            }
            .pickerStyle(.navigationLink)
            Campo(titulo: "Ahorro para abono", ayuda: "Si tu meta es un carro o una casa", texto: $form.savingsForDownPayment,
                  ejemplo: "0", error: errores["savingsForDownPayment"])
        }
    }

    private var deudas: some View {
        Section {
            ForEach($form.debts) { $d in
                let i = form.debts.firstIndex { $0.id == d.id } ?? 0
                VStack(alignment: .leading, spacing: 10) {
                    Picker("Deuda \(i + 1)", selection: $d.kind) {
                        ForEach(DebtKind.allCases) { k in Text(Self.etiqueta(k)).tag(k) }
                    }
                    .font(.headline)
                    Campo(titulo: "Saldo", texto: $d.balance, ejemplo: "0", error: errores["debts.\(i).balance"])
                    Campo(titulo: "Pago mensual", texto: $d.monthlyPayment, ejemplo: "0", error: errores["debts.\(i).monthlyPayment"])
                    if d.kind == .creditCard {
                        Campo(titulo: "Límite de la tarjeta", texto: $d.limit, ejemplo: "0", error: errores["debts.\(i).limit"])
                    }
                    Button("Quitar esta deuda", role: .destructive) {
                        withAnimation { form.debts.removeAll { $0.id == d.id } }
                    }
                    .font(.subheadline)
                    .buttonStyle(.borderless)
                }
                .padding(.vertical, 4)
            }
            .onDelete { form.debts.remove(atOffsets: $0) }
            Button("Agregar deuda", systemImage: "plus.circle.fill") {
                withAnimation { form.debts.append(DebtForm()) }
            }
        } header: {
            Text("Tus deudas")
        } footer: {
            Text("Incluye tarjetas aunque las pagues completas cada mes.")
        }
    }

    private var documentos: some View {
        Section("Documentos listos") {
            Toggle("Talonario o ficha de la CSS", isOn: $form.documents.incomeProof)
            Toggle("Carta de trabajo", isOn: $form.documents.employmentLetter)
            Toggle("Reporte de historial de crédito", isOn: $form.documents.apcReport)
        }
    }

    private var guardar: some View {
        Section {
            if !errores.isEmpty { Aviso("Revisa los campos marcados.", tono: .error) }
            if let errorGuardar { Aviso(errorGuardar, tono: .error) }
            Button { guardarPerfil() } label: {
                ZStack {
                    Text("Guardar perfil").opacity(ocupado ? 0 : 1)
                    if ocupado { ProgressView() }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(ocupado)
            if guardado {
                Label("Perfil guardado. Tus metas se recalculan con estos datos.", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(Color.bien)
                    .font(.subheadline.weight(.semibold))
                Button("Ver mis metas") { nav.pestana = .metas }
            }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
    }

    private var cuenta: some View {
        Section {
            if let email = sesion.email {
                LabeledContent("Entraste como", value: email)
            }
            Button("Salir", systemImage: "rectangle.portrait.and.arrow.right") { sesion.salir() }
            Button("Eliminar mi cuenta", systemImage: "trash", role: .destructive) { confirmarBorrado = true }
                .disabled(borrando)
                .confirmationDialog("¿Eliminar tu cuenta?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                    Button("Eliminar mi cuenta", role: .destructive) { eliminar() }
                } message: {
                    Text("Borramos tu perfil, tus metas, tus planes y tus conversaciones. No se puede deshacer.")
                }
        } header: {
            Text("Cuenta")
        }
    }

    // MARK: Acciones

    private func cargar() async {
        guard !cargado else { return }
        if let s = try? await sesion.api.snapshot() { form = ProfileForm(snapshot: s.snapshot) }
        cargado = true
    }

    private func guardarPerfil() {
        ocultarTeclado()
        switch form.validar() {
        case .errores(let e):
            withAnimation { errores = e }
        case .ok(let snapshot):
            errores = [:]
            ocupado = true
            errorGuardar = nil
            Task {
                do {
                    try await sesion.api.saveSnapshot(snapshot)
                    withAnimation { guardado = true }
                } catch {
                    errorGuardar = (error as? LocalizedError)?.errorDescription ?? "No pudimos guardar tu perfil."
                }
                ocupado = false
            }
        }
    }

    private func eliminar() {
        borrando = true
        Task {
            do {
                try await sesion.eliminarCuenta()
            } catch {
                errorGuardar = (error as? LocalizedError)?.errorDescription ?? "No pudimos eliminar tu cuenta."
            }
            borrando = false
        }
    }

    private func ocultarTeclado() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

/// Campo de texto de un formulario con ayuda y error.
struct Campo: View {
    let titulo: String
    var ayuda: String?
    @Binding var texto: String
    var ejemplo = ""
    var teclado: UIKeyboardType = .decimalPad
    var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent(titulo) {
                TextField(ejemplo, text: $texto)
                    .keyboardType(teclado)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .accessibilityLabel(titulo)
            }
            if let ayuda { Text(ayuda).font(.caption).foregroundStyle(.secondary) }
            if let error { Text(error).font(.caption.weight(.medium)).foregroundStyle(Color.alerta) }
        }
    }
}
