import Foundation
import Security

/// Guarda datos sensibles (la sesión de Supabase) en el Llavero de iOS, solo en este dispositivo.
enum Llavero {
    private static let servicio = "pa.financialgenius.app"

    private static func consulta(_ cuenta: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio, kSecAttrAccount as String: cuenta]
    }

    static func leer(_ cuenta: String) -> Data? {
        var q = consulta(cuenta)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    static func guardar(_ datos: Data?, _ cuenta: String) {
        SecItemDelete(consulta(cuenta) as CFDictionary)
        guard let datos else { return }
        var q = consulta(cuenta)
        q[kSecValueData as String] = datos
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
}
