import SwiftUI
import FinancialGeniusCore

/// Detalle de una meta: nivel de la esclusa, lo que te frena y a dónde ir.
struct MetaDetallePantalla: View {
    let goalId: String
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var meta: GoalView?
    @State private var preparacion: ReadinessView?
    @State private var error: APIError?

    /// A partir de aquí la esclusa marca "listo" (igual que la app de Android y web).
    private let umbral = 70.0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if error?.code == "snapshot_required" {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Primero, tu perfil").font(.title2.bold())
                        Text("Para calcular qué tan cerca estás necesitamos tus ingresos y deudas.").foregroundStyle(.secondary)
                        Button("Completar mi perfil") { nav.pestana = .perfil }.buttonStyle(.glassProminent)
                    }
                } else if let error {
                    Aviso(error.message, tono: .error)
                }
                if let meta, let r = preparacion { contenido(meta, r) }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .overlay { if meta == nil && error == nil { ProgressView() } }
        .navigationTitle(meta.map { Formato.goalLabel($0.type) } ?? "")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await cargar() }
        .task { await cargar() }
    }

    @ViewBuilder
    private func contenido(_ meta: GoalView, _ r: ReadinessView) -> some View {
        if let monto = meta.targetAmount {
            Text("Meta de \(Formato.money(monto))\(meta.desiredTermMonths.map { " a \($0) meses" } ?? "")")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        EsclusaNivel(score: r.score, umbral: umbral, etiqueta: Formato.levelLabel(score: r.score, ready: r.readyToCompare))

        GlassEffectContainer(spacing: 10) {
            VStack(spacing: 10) {
                Button { ir(.productos) } label: {
                    Label("Ver las mejores opciones", systemImage: "list.number").frame(maxWidth: .infinity)
                }
                .botonGlass(prominente: r.readyToCompare)
                Button { ir(.plan) } label: {
                    Label("Ver mi plan del mes", systemImage: "checklist").frame(maxWidth: .infinity)
                }
                .botonGlass(prominente: !r.readyToCompare)
            }
            .controlSize(.large)
        }

        Text(r.obstacles.isEmpty ? "Nada te frena por ahora" : "Lo que te frena")
            .font(.title3.bold())
            .padding(.top, 8)
        ForEach(r.obstacles) { o in
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(Formato.factorLabel(o.factor)).font(.headline)
                    Spacer()
                    if o.blocking {
                        Label("Bloquea", systemImage: "lock.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.alerta)
                    } else {
                        Text("+\(JS.numberToString(JS.round(o.impactPoints))) pts")
                            .font(.subheadline.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Color.aguaProfunda)
                    }
                }
                Text(Formato.obstacleDetail(o.factor, o.evidence))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .superficie(radio: 20)
            .accessibilityElement(children: .combine)
        }

        Text("Este índice es nuestro, no es tu puntaje de la APC. Calculado con tus datos del \(String(r.snapshotDate.prefix(10))).")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.top, 8)
    }

    private func ir(_ p: Pestana) {
        sesion.metaId = goalId
        nav.pestana = p
    }

    private func cargar() async {
        let api = sesion.api
        do {
            async let g = api.goal(goalId)
            async let r = api.readiness(goalId)
            let (nuevaMeta, nuevaPrep) = try await (g, r)
            withAnimation(.snappy) {
                meta = nuevaMeta
                preparacion = nuevaPrep
            }
            error = nil
        } catch let e as APIError {
            error = e
        } catch {
            self.error = .network
        }
    }
}
