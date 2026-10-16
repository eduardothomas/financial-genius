// swift-tools-version: 6.0
// Lógica pura de la app iOS: modelos, cliente de la API, Supabase Auth, textos y formulario.
// Sin UI: se prueba con `swift test` (también en Linux) y la app la importa.
import PackageDescription

let package = Package(
    name: "FinancialGeniusCore",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [
        .library(name: "FinancialGeniusCore", targets: ["FinancialGeniusCore"]),
    ],
    targets: [
        .target(name: "FinancialGeniusCore"),
        .testTarget(
            name: "FinancialGeniusCoreTests",
            dependencies: ["FinancialGeniusCore"],
            exclude: ["casos-dorados.json"]
        ),
    ]
)
