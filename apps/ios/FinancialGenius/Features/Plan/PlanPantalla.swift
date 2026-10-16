import SwiftUI
import FinancialGeniusCore

/// Plan del mes: un objetivo y pocas misiones concretas para esta semana.
struct PlanPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var metas: [GoalView]?
    @State private var plan: PlanView?
    @State private var planCargado = false
    @State private var planMetaId: String?
    @State private var cargandoPlan = false
    @State private var creando = false
    @State private var errorCrear: APIError?
    @State private var error: String?

    private var meta: GoalView? { metas?.first { $0.id == sesion.metaId } }
    private var hechas: Int { plan?.actions.filter { $0.status == .done }.count ?? 0 }

    var body: some View {
        @Bindable var sesion = sesion
        NavigationStack {
            List {
                if let metas, metas.count >= 2 {
                    SelectorDeMeta(metas: metas, seleccion: $sesion.metaId)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: -4, bottom: 0, trailing: -4))
                        .listRowSeparator(.hidden)
                }
                if let metas, metas.isEmpty {
                    ContentUnavailableView {
                        Label("Sin plan todavía", systemImage: "checklist")
                    } description: {
                        Text("Tu plan sale de tus metas. Crea una para empezar.")
                    } actions: {
                        Button("Agregar meta") {
                            nav.pestana = .metas
                            nav.nuevaMeta = true
                        }
                        .buttonStyle(.glassProminent)
                    }
                    .listRowBackground(Color.clear)
                }
                if let error {
                    Aviso(error, tono: .error).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                }
                if let meta, planCargado, plan == nil { sinPlan(meta) }
                if let plan { contenido(plan) }
            }
            .overlay { if (metas == nil && error == nil) || (cargandoPlan && plan == nil) { ProgressView() } }
            .navigationTitle("Tu plan")
            .sensoryFeedback(trigger: hechas) { antes, ahora in ahora > antes ? .success : .selection }
            .refreshable { await cargarTodo() }
            .task { await cargarMetas() }
            .task(id: sesion.metaId) { await cargarPlan() }
        }
    }

    @ViewBuilder
    private func sinPlan(_ meta: GoalView) -> some View {
        Section {
            Text("Armamos un plan para \(Formato.goalLabel(meta.type).lowercased()) a partir de lo que hoy te frena: un objetivo para el mes y pocas acciones concretas para esta semana.")
                .foregroundStyle(.secondary)
            Button { crear() } label: {
                ZStack {
                    Text("Crear mi plan del mes").opacity(creando ? 0 : 1)
                    if creando { ProgressView() }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(creando)
            if let e = errorCrear {
                if e.code == "snapshot_required" {
                    Aviso("\(e.message).")
                    Button("Completar mi perfil") { nav.pestana = .perfil }
                } else {
                    Aviso(e.message, tono: .error)
                }
            }
        }
    }

    @ViewBuilder
    private func contenido(_ plan: PlanView) -> some View {
        Section {
            Text(plan.objective)
                .font(.title2.bold())
                .foregroundStyle(Color.esclusa)
                .padding(.vertical, 4)
            ProgressView(value: Double(hechas), total: Double(max(plan.actions.count, 1)))
                .tint(Color.agua)
        } header: {
            Text("Objetivo de \(Formato.monthLabel(plan.month))").textCase(nil)
        }
        Section {
            ForEach(plan.actions) { a in
                FilaMision(accion: a) { alternar(a) }
            }
        } header: {
            let semana = plan.actions.first.map { "Esta \(Formato.weekLabel($0.weekStart))" } ?? "Esta semana"
            Text("\(semana): \(hechas) de \(plan.actions.count) hechas").textCase(nil)
        }
    }

    private func cargarTodo() async {
        await cargarMetas()
        await cargarPlan()
    }

    private func cargarMetas() async {
        do {
            let nuevas = try await sesion.api.goals()
            metas = nuevas
            asegurarMeta(nuevas, en: sesion)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func cargarPlan() async {
        guard let id = sesion.metaId else { return }
        if planMetaId != id {
            plan = nil
            planCargado = false
        }
        cargandoPlan = true
        errorCrear = nil
        defer { cargandoPlan = false }
        do {
            let p = try await sesion.api.plan(id)
            guard id == sesion.metaId else { return }
            plan = p
            planMetaId = id
            planCargado = true
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func crear() {
        guard let id = sesion.metaId else { return }
        creando = true
        errorCrear = nil
        Task {
            do {
                let p = try await sesion.api.createPlan(id)
                withAnimation(.snappy) { plan = p }
            } catch let e as APIError {
                errorCrear = e
            } catch {
                errorCrear = .network
            }
            creando = false
        }
    }

    /// Marca o desmarca la misión al instante; si la API falla, se revierte.
    private func alternar(_ a: PlanAction) {
        guard var actual = plan, let i = actual.actions.firstIndex(where: { $0.id == a.id }) else { return }
        let anterior = actual
        let siguiente: ActionStatus = a.status == .done ? .pending : .done
        actual.actions[i].status = siguiente
        withAnimation(.snappy) { plan = actual }
        Task {
            do {
                try await sesion.api.setAction(a.id, status: siguiente)
            } catch {
                withAnimation { plan = anterior }
            }
        }
    }
}

struct FilaMision: View {
    let accion: PlanAction
    let alternar: () -> Void

    private var hecha: Bool { accion.status == .done }

    var body: some View {
        Button(action: alternar) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Image(systemName: hecha ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(hecha ? Color.bien : Color.secondary)
                    .contentTransition(.symbolEffect(.replace))
                Text(accion.title)
                    .foregroundStyle(hecha ? .secondary : .primary)
                    .strikethrough(hecha, color: .secondary)
                    .multilineTextAlignment(.leading)
            }
            .padding(.vertical, 4)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(hecha ? .isSelected : [])
        .accessibilityHint(hecha ? "Toca para marcarla como pendiente" : "Toca para marcarla como hecha")
    }
}
