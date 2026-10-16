import SwiftUI

@main
struct FinancialGeniusApp: App {
    @State private var sesion = Sesion()
    @State private var nav = Navegacion()

    var body: some Scene {
        WindowGroup {
            Raiz()
                .environment(sesion)
                .environment(nav)
                .tint(Color.esclusa)
        }
    }
}

/// Entrar o la app, según haya sesión.
struct Raiz: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav

    var body: some View {
        Group {
            if sesion.email == nil {
                EntrarPantalla().transition(.opacity)
            } else {
                Pestanas().transition(.opacity)
            }
        }
        .animation(.smooth, value: sesion.email)
        .onChange(of: sesion.email) { nav.reiniciar() }
    }
}

struct Pestanas: View {
    @Environment(Navegacion.self) private var nav

    var body: some View {
        @Bindable var nav = nav
        TabView(selection: $nav.pestana) {
            Tab("Genio", systemImage: "sparkles", value: Pestana.genio) { GenioPantalla() }
            Tab("Metas", systemImage: "flag.pattern.checkered", value: Pestana.metas) { MetasPantalla() }
            Tab("Plan", systemImage: "checklist", value: Pestana.plan) { PlanPantalla() }
            Tab("Productos", systemImage: "creditcard", value: Pestana.productos) { ProductosPantalla() }
            Tab("Perfil", systemImage: "person.crop.circle", value: Pestana.perfil) { PerfilPantalla() }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
