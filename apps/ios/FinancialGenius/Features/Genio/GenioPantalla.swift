import SwiftUI
import FinancialGeniusCore

/// Chat con el Genio. Solo explica datos del motor y del catálogo (las herramientas viven en la API).
struct GenioPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(Navegacion.self) private var nav
    @State private var conversationId: String?
    @State private var mensajes: [ChatMessage] = []
    @State private var texto = ""
    @State private var enviando = false
    @State private var error: String?
    @State private var metas: [GoalView]?
    @State private var tienePerfil = false
    @State private var historialCargado = false
    @FocusState private var escribiendo: Bool

    private var sugerencias: [String] {
        enviando ? [] : ChatLogic.suggestions(goals: metas, hasProfile: tienePerfil)
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if mensajes.isEmpty { bienvenida }
                        ForEach(mensajes) { m in
                            Burbuja(mensaje: m) { card in nav.ir(a: card.destino, sesion: sesion, goalId: card.goalId) }
                                .id(m.id)
                                .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
                        }
                        if enviando { pensando.id("pensando") }
                        if let error { Aviso(error, tono: .error) }
                        if !sugerencias.isEmpty { chips }
                        Color.clear.frame(height: 1).id("fin")
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .animation(.snappy, value: mensajes)
                    .animation(.snappy, value: enviando)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(mensajes.isEmpty ? .top : .bottom)
                .onChange(of: mensajes.count) { bajar(proxy) }
                .onChange(of: enviando) { bajar(proxy) }
            }
            .safeAreaBar(edge: .bottom) { compositor }
            .navigationTitle("Tu Genio")
            .toolbar {
                if !mensajes.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Nueva conversación", systemImage: "square.and.pencil") { nueva() }
                    }
                }
            }
            .task { await cargar() }
        }
    }

    private var bienvenida: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color.agua)
                .symbolEffect(.pulse, options: .nonRepeating)
            Text("Pregúntame si estás listo para tu meta, qué hacer este mes o cuál es la mejor opción para ti. Uso tus datos y el catálogo de bancos: no invento tasas y la aprobación siempre la decide el banco.")
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }

    private var pensando: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Revisando tus datos…").foregroundStyle(.secondary)
        }
        .padding(14)
        .background(.background.secondary, in: .rect(cornerRadius: 20))
    }

    private var chips: some View {
        GlassEffectContainer(spacing: 8) {
            VStack(alignment: .trailing, spacing: 8) {
                ForEach(sugerencias, id: \.self) { s in
                    Button(s) { enviar(s) }
                        .buttonStyle(.glass)
                        .multilineTextAlignment(.trailing)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.top, 6)
    }

    private var compositor: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Escríbele a tu Genio", text: $texto, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($escribiendo)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 24))
                    .accessibilityLabel("Mensaje para el Genio")
                    .onChange(of: texto) { if texto.count > 2000 { texto = String(texto.prefix(2000)) } }
                Button { enviar(texto) } label: {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.bold))
                        .frame(width: 28, height: 32)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .disabled(texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || enviando)
                .accessibilityLabel("Enviar")
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private func bajar(_ proxy: ScrollViewProxy) {
        withAnimation(.snappy) { proxy.scrollTo("fin", anchor: .bottom) }
    }

    private func cargar() async {
        let api = sesion.api
        async let g = try? api.goals()
        async let me = try? api.me()
        metas = await g ?? metas
        if let m = await me { tienePerfil = m.hasSnapshot }
        // Retoma la conversación más reciente (una vez)
        guard !historialCargado else { return }
        historialCargado = true
        if let ultima = try? await api.conversations().first,
           let previos = try? await api.conversation(ultima.id), mensajes.isEmpty {
            conversationId = ultima.id
            mensajes = previos
        }
    }

    private func nueva() {
        conversationId = nil
        mensajes = []
        error = nil
    }

    private func enviar(_ crudo: String) {
        let mensaje = crudo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !mensaje.isEmpty, !enviando else { return }
        error = nil
        texto = ""
        let mio = ChatMessage(id: "local-\(UUID().uuidString)", role: .user, content: mensaje)
        mensajes.append(mio)
        enviando = true
        Task {
            do {
                let r = try await sesion.api.chat(mensaje, conversationId: conversationId)
                conversationId = r.conversationId
                mensajes.append(ChatMessage(id: r.messageId, role: .assistant, content: r.reply, attachments: r.attachments))
                if r.attachments.contains(where: { a in
                    if case .goal = a { return true }
                    return false
                }) {
                    metas = try? await sesion.api.goals()
                }
            } catch {
                mensajes.removeAll { $0.id == mio.id }
                texto = mensaje
                if let e = error as? APIError, e.code == "chat_unavailable" {
                    self.error = "El Genio no está disponible ahora. Mientras tanto, usa las pestañas Metas, Plan y Productos."
                } else {
                    self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos enviar tu mensaje."
                }
            }
            enviando = false
        }
    }
}

/// Un mensaje del chat, con sus tarjetas.
struct Burbuja: View {
    let mensaje: ChatMessage
    let abrir: (CardView) -> Void

    private var esMio: Bool { mensaje.role == .user }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(mensaje.content)
                .foregroundStyle(esMio ? Color.white : Color.primary)
                .textSelection(.enabled)
            ForEach(Array(mensaje.attachments.enumerated()), id: \.offset) { _, a in
                if let c = ChatLogic.card(a) {
                    TarjetaAdjunta(card: c) { abrir(c) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(esMio ? AnyShapeStyle(Color.esclusaFuerte) : AnyShapeStyle(.background.secondary),
                    in: UnevenRoundedRectangle(cornerRadii: esMio
                        ? .init(topLeading: 22, bottomLeading: 22, bottomTrailing: 6, topTrailing: 22)
                        : .init(topLeading: 22, bottomLeading: 6, bottomTrailing: 22, topTrailing: 22)))
        .frame(maxWidth: .infinity, alignment: esMio ? .trailing : .leading)
        .padding(esMio ? .leading : .trailing, 36)
    }
}

/// Tarjeta del Genio que lleva a Metas, Plan o Productos.
struct TarjetaAdjunta: View {
    let card: CardView
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            HStack(spacing: 12) {
                Capsule().fill(Color.agua).frame(width: 4)
                VStack(alignment: .leading, spacing: 3) {
                    Text(card.title).font(.headline).foregroundStyle(.primary)
                    Text(card.detail).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 16))
    }
}
