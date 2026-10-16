import SwiftUI
import FinancialGeniusCore

/// Las 3 mejores opciones del catálogo para la meta elegida, con sus razones y su fuente.
struct ProductosPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var metas: [GoalView]?
    @State private var rec: RecommendationsView?
    @State private var cargando = false
    @State private var error: APIError?

    var body: some View {
        @Bindable var sesion = sesion
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let metas, metas.count >= 2 {
                        SelectorDeMeta(metas: metas, seleccion: $sesion.metaId)
                            .padding(.horizontal, -16)
                    }
                    if let metas, metas.isEmpty {
                        ContentUnavailableView {
                            Label("Sin metas todavía", systemImage: "magnifyingglass")
                        } description: {
                            Text("Primero dinos qué quieres lograr y buscamos en el mercado por ti.")
                        } actions: {
                            Button("Agregar meta") {
                                nav.pestana = .metas
                                nav.nuevaMeta = true
                            }
                            .buttonStyle(.glassProminent)
                        }
                    }
                    if let error {
                        if error.code == "snapshot_required" {
                            Aviso("\(error.message).")
                            Button("Completar mi perfil") { nav.pestana = .perfil }.buttonStyle(.glassProminent)
                        } else {
                            Aviso(error.message, tono: .error)
                        }
                    }
                    if let rec { contenido(rec) }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .overlay { if (metas == nil && error == nil) || (cargando && rec == nil) { ProgressView() } }
            .navigationTitle("Mejores opciones")
            .refreshable { await cargarTodo() }
            .task { await cargarMetas() }
            .task(id: sesion.metaId) { await cargarOpciones() }
        }
    }

    @ViewBuilder
    private func contenido(_ rec: RecommendationsView) -> some View {
        Text("Revisamos \(rec.consideredCount) productos y cumples los requisitos de \(rec.eligibleCount). Los ordenamos por costo total, qué tan holgado cumples los requisitos y cuánto pesa la cuota en tu presupuesto.")
            .foregroundStyle(.secondary)
        if let notice = rec.notice { Aviso(notice) }
        if rec.top.isEmpty {
            Text("Hoy no cumples los requisitos públicos de ningún producto. Tu plan del mes te dice qué cambiar.")
                .superficie()
        }
        ForEach(rec.top) { p in TarjetaProducto(producto: p) }
        if !rec.top.isEmpty {
            Text("Ningún banco paga por aparecer aquí ni por su posición. Confirma tasa y requisitos con el banco antes de aplicar: la aprobación siempre la decide el banco.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func cargarTodo() async {
        await cargarMetas()
        await cargarOpciones()
    }

    private func cargarMetas() async {
        do {
            let nuevas = try await sesion.api.goals()
            metas = nuevas
            asegurarMeta(nuevas, en: sesion)
        } catch let e as APIError {
            error = e
        } catch {}
    }

    private func cargarOpciones() async {
        guard let id = sesion.metaId else { return }
        if rec?.goalId != id { rec = nil }
        cargando = true
        defer { cargando = false }
        do {
            let r = try await sesion.api.recommendations(id)
            guard id == sesion.metaId else { return }
            withAnimation(.snappy) { rec = r }
            error = nil
        } catch let e as APIError {
            rec = nil
            error = e
        } catch {}
    }
}

struct TarjetaProducto: View {
    let producto: RankedProduct

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Text(String(producto.position))
                    .font(.system(.largeTitle, design: .rounded).bold())
                    .foregroundStyle(Color.aguaProfunda)
                    .frame(minWidth: 30)
                    .accessibilityLabel("Opción \(producto.position)")
                VStack(alignment: .leading, spacing: 2) {
                    Text(producto.name).font(.headline)
                    Text(producto.institutionName).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if let cuota = producto.estimatedMonthlyPayment {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Formato.money(cuota)).font(.headline).monospacedDigit()
                        Text("al mes, aprox.").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Text("Por qué está aquí").font(.subheadline.weight(.semibold))
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(producto.reasons.enumerated()), id: \.offset) { _, r in
                    Label {
                        Text(Formato.reasonText(r))
                    } icon: {
                        Image(systemName: "checkmark").foregroundStyle(Color.bien)
                    }
                    .font(.subheadline)
                }
            }
            if !producto.assumptions.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(producto.assumptions, id: \.self) { a in
                        Text(a).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let url = URL(string: producto.source.url) {
                Link(destination: url) {
                    Label("Fuente del banco, revisada el \(producto.source.capturedAt)", systemImage: "arrow.up.right.square")
                        .font(.caption)
                }
            } else {
                Text("Fuente del banco, revisada el \(producto.source.capturedAt)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .superficie(radio: 26)
    }
}
