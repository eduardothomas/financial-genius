import SwiftUI
import FinancialGeniusCore

/// Entrar: en producción, código de un solo uso por correo (Supabase); en desarrollo, solo el correo.
struct EntrarPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var correo = ""
    @State private var codigo = ""
    @State private var paso: Paso = .correo
    @State private var ocupado = false
    @State private var error: String?
    @State private var info: String?
    @FocusState private var campo: Campo?

    enum Paso { case correo, codigo }
    enum Campo { case correo, codigo }

    private var correoValido: Bool {
        let t = correo.trimmingCharacters(in: .whitespaces)
        let partes = t.split(separator: "@", omittingEmptySubsequences: false)
        return partes.count == 2 && !partes[0].isEmpty && partes[1].contains(".") && !t.contains(" ")
            && !partes[1].hasPrefix(".") && !partes[1].hasSuffix(".")
    }

    private var codigoValido: Bool {
        let c = codigo.filter { !$0.isWhitespace }
        return (6...10).contains(c.count) && c.allSatisfy(\.isNumber)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                encabezado
                GlassEffectContainer(spacing: 14) {
                    VStack(alignment: .leading, spacing: 14) {
                        switch (sesion.modo, paso) {
                        case (.desarrollo, _): desarrollo
                        case (.supabase, .correo): pedirCodigo
                        case (.supabase, .codigo): ingresarCodigo
                        }
                        if let error { Aviso(error, tono: .error) }
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 72)
            .padding(.bottom, 32)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background { FondoEsclusa().ignoresSafeArea() }
        .animation(.snappy, value: paso)
    }

    private var encabezado: some View {
        VStack(alignment: .leading, spacing: 14) {
            CamaraEsclusa(nivel: 0.62, umbral: 0.7, trazo: 3, radio: 12)
                .frame(width: 44, height: 64)
                .accessibilityHidden(true)
            Text("Tu genio financiero")
                .font(.largeTitle.bold())
                .foregroundStyle(Color.esclusa)
            Text("Dinos a dónde quieres llegar —tu tarjeta, tu carro, tu casa— y te mostramos qué tan cerca estás, qué hacer este mes y dónde aplicar cuando estés listo.")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
    }

    private func campoCorreo(alEnviar: @escaping () -> Void) -> some View {
        TextField("tu@correo.com", text: $correo)
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.go)
            .focused($campo, equals: .correo)
            .onSubmit(alEnviar)
            .padding(.horizontal, 18)
            .padding(.vertical, 15)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 20))
            .accessibilityLabel("Correo")
            .accessibilityIdentifier("correo")
    }

    private func botonPrincipal(_ titulo: String, habilitado: Bool, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            ZStack {
                Text(titulo).opacity(ocupado ? 0 : 1)
                if ocupado { ProgressView() }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .disabled(!habilitado || ocupado)
    }

    private var desarrollo: some View {
        VStack(alignment: .leading, spacing: 14) {
            campoCorreo { if correoValido { sesion.entrar(email: correo) } }
            botonPrincipal("Entrar", habilitado: correoValido) { sesion.entrar(email: correo) }
            Aviso("Versión de prueba: entras solo con tu correo.")
        }
    }

    private var pedirCodigo: some View {
        VStack(alignment: .leading, spacing: 14) {
            campoCorreo { if correoValido && !ocupado { enviarCodigo() } }
            botonPrincipal("Enviarme un código", habilitado: correoValido) { enviarCodigo() }
            Text("Sin contraseñas: cada vez que entres te enviamos un código de un solo uso.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var ingresarCodigo: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let info { Text(info).font(.subheadline).foregroundStyle(.secondary) }
            TextField("123456", text: $codigo)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .font(.title2.monospacedDigit())
                .focused($campo, equals: .codigo)
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 20))
                .accessibilityLabel("Código")
                .onChange(of: codigo) { if codigo.count > 12 { codigo = String(codigo.prefix(12)) } }
            botonPrincipal("Entrar", habilitado: codigoValido) { verificar() }
            HStack(spacing: 20) {
                Button("Reenviar código") { enviarCodigo() }
                    .disabled(ocupado)
                Button("Usar otro correo") {
                    paso = .correo
                    error = nil
                    info = nil
                }
            }
            .font(.footnote)
            .buttonStyle(.borderless)
        }
        .onAppear { campo = .codigo }
    }

    private func ejecutar(_ trabajo: @escaping @MainActor () async throws -> Void) {
        ocupado = true
        error = nil
        Task {
            do {
                try await trabajo()
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? "Algo salió mal."
            }
            ocupado = false
        }
    }

    private func enviarCodigo() {
        let destino = correo.trimmingCharacters(in: .whitespaces).lowercased()
        ejecutar {
            try await sesion.pedirCodigo(destino)
            paso = .codigo
            codigo = ""
            info = "Te enviamos un código a \(destino). Revisa también la carpeta de spam."
        }
    }

    private func verificar() {
        ejecutar { try await sesion.verificarCodigo(correo, codigo) }
    }
}

/// Fondo de la pantalla de entrada: el agua de la esclusa a media altura.
struct FondoEsclusa: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
            LinearGradient(
                colors: [Color.esclusa.opacity(0.28), Color.esclusa.opacity(0.06), Color.agua.opacity(0.22)],
                startPoint: .top, endPoint: .bottom)
        }
    }
}
