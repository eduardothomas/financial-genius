import SwiftUI
import FinancialGeniusCore

struct MetasPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var metas: [GoalView]?
    @State private var me: Me?
    @State private var error: String?
    @Namespace private var transicion

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.rutaMetas) {
            List {
                if let me, !me.hasSnapshot {
                    Section {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Para saber qué tan cerca estás, necesitamos tus datos financieros básicos. Toma unos 3 minutos.")
                            Button("Completar mi perfil") { nav.pestana = .perfil }
                                .buttonStyle(.glassProminent)
                        }
                        .padding(.vertical, 6)
                    }
                }
                if let error {
                    Section { Aviso(error, tono: .error) }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                if let metas, !metas.isEmpty {
                    Section {
                        ForEach(metas) { g in
                            NavigationLink(value: g.id) { FilaMeta(meta: g) }
                                .matchedTransitionSource(id: g.id, in: transicion)
                                .accessibilityIdentifier("meta-\(g.type.rawValue)")
                        }
                    }
                }
                Section {
                    Button("Agregar meta", systemImage: "plus.circle.fill") { nav.nuevaMeta = true }
                }
            }
            .overlay {
                if metas == nil && error == nil {
                    ProgressView()
                } else if let metas, metas.isEmpty {
                    ContentUnavailableView {
                        Label("Aún no tienes metas", systemImage: "flag")
                    } description: {
                        Text("Empieza por la que más te importa: una tarjeta, un carro o tu casa.")
                    } actions: {
                        Button("Agregar meta") { nav.nuevaMeta = true }.buttonStyle(.glassProminent)
                    }
                }
            }
            .navigationTitle("Tus metas")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Agregar meta", systemImage: "plus") { nav.nuevaMeta = true }
                }
            }
            .navigationDestination(for: String.self) { id in
                MetaDetallePantalla(goalId: id)
                    .navigationTransition(.zoom(sourceID: id, in: transicion))
            }
            .sheet(isPresented: $nav.nuevaMeta) {
                NuevaMetaPantalla(cantidadMetas: metas?.count ?? 0) { g in
                    sesion.metaId = g.id
                    nav.rutaMetas = [g.id]
                    Task { await cargar() }
                }
            }
            .refreshable { await cargar() }
            .task { await cargar() }
        }
    }

    private func cargar() async {
        let api = sesion.api
        do {
            async let m = api.me()
            async let g = api.goals()
            let (nuevoMe, nuevas) = try await (m, g)
            me = nuevoMe
            metas = nuevas
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar tus metas."
        }
    }
}

struct FilaMeta: View {
    let meta: GoalView

    var body: some View {
        HStack(spacing: 14) {
            MiniEsclusa(score: meta.readinessScore)
            VStack(alignment: .leading, spacing: 2) {
                Text(Formato.goalLabel(meta.type)).font(.headline)
                Text("Prioridad \(meta.priority)\(meta.targetAmount.map { ", \(Formato.money($0))" } ?? "")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(meta.readinessScore.map { JS.numberToString(JS.round($0)) } ?? "—")
                .font(.title2.bold())
                .monospacedDigit()
                .foregroundStyle(Color.esclusa)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Formato.goalLabel(meta.type)), preparación \(meta.readinessScore.map { JS.numberToString(JS.round($0)) } ?? "sin calcular")")
    }
}
