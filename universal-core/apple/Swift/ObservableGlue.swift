import Foundation
import Combine

/// Swift ObservableObject glue — binds Universal-Core FFI to reactive SwiftUI.
/// All methods delegate to V2RayEZCoreHandle (FFI wrapper) only.
/// Memory: handle dropped in deinit; returned strings freed immediately.
public final class CoreObservableState: ObservableObject {
    @Published public var statusJson: String = "{}"
    @Published public var isRunning: Bool = false
    @Published public var error: String? = nil

    private var handle: V2RayEZCoreHandle?

    public init() {
        handle = V2RayEZCoreHandle()
    }

    public func start(requestJson: String) {
        guard let h = handle else { error = "not_initialized"; return }
        statusJson = h.start(requestJson: requestJson) ?? "{}"
        isRunning = true
    }

    public func stop() {
        guard let h = handle else { error = "not_initialized"; return }
        statusJson = h.stop() ?? "{}"
        isRunning = false
    }

    public func pollStatus() {
        guard let h = handle else { error = "not_initialized"; return }
        statusJson = h.status() ?? "{}"
    }

    deinit {
        // Handle dropped automatically; v2rayez_core_shutdown triggered
        handle = nil
    }
}
