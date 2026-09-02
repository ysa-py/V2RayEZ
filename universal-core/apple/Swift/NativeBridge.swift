import Foundation

/// Swift wrapper over the universal shared core C-ABI.
/// Memory ownership: returned C strings are immediately converted to Swift
/// String and freed via v2rayez_free_string; session handle dropped on deinit.
public final class V2RayEZCoreHandle {
    private var handle: UnsafeMutableRawPointer?

    public init() {
        handle = v2rayez_core_init()
    }

    deinit {
        if let h = handle {
            v2rayez_core_shutdown(h)
            handle = nil
        }
    }

    public func status() -> String? {
        guard let h = handle else { return nil }
        guard let cstr = v2rayez_core_status(h) else { return nil }
        defer { v2rayez_free_string(cstr) }
        return String(cString: cstr)
    }

    public func start(requestJson: String) -> String? {
        guard let h = handle else { return nil }
        return requestJson.withCString { reqPtr in
            guard let resp = v2rayez_core_start(h, reqPtr) else { return nil }
            defer { v2rayez_free_string(resp) }
            return String(cString: resp)
        }
    }

    public func stop() -> String? {
        guard let h = handle else { return nil }
        guard let resp = v2rayez_core_stop(h) else { return nil }
        defer { v2rayez_free_string(resp) }
        return String(cString: resp)
    }
}
