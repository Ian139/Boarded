import Foundation

#if canImport(Supabase)
import Supabase
#endif

enum SupabaseConfig {
    static var current: (url: URL, anonKey: String)? {
        guard
            let urlString = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let url = URL(string: urlString),
            !key.isEmpty
        else {
            return nil
        }
        return (url: url, anonKey: key)
    }
}

#if canImport(Supabase)
enum SupabaseClientProvider {
    static let client: SupabaseClient? = {
        guard let config = SupabaseConfig.current else { return nil }
        return SupabaseClient(
            supabaseURL: config.url,
            supabaseKey: config.anonKey,
            options: SupabaseClientOptions(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
    }()
}
#endif
