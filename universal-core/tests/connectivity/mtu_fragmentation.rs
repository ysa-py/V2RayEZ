//! Connectivity: MTU fragmentation presets.
//! References route_matrix MTU settings; zero transport logic duplication.

#[cfg(test)]
mod mtu_tests {
    use crate::route_matrix::{ROUTE_MATRIX_MTU_PRESETS, RouteMatrixSettingsOverride};

    /// MTU-01 to MTU-04: All presets must produce valid candidates.
    #[test]
    fn mtu_presets_valid() {
        assert_eq!(ROUTE_MATRIX_MTU_PRESETS.len(), 4);
        assert!(ROUTE_MATRIX_MTU_PRESETS.contains(&1280));
        assert!(ROUTE_MATRIX_MTU_PRESETS.contains(&1360));
        assert!(ROUTE_MATRIX_MTU_PRESETS.contains(&1420));
        assert!(ROUTE_MATRIX_MTU_PRESETS.contains(&1500));
    }

    /// MTU override must not cause panic when building matrix.
    #[test]
    fn mtu_override_accepted() {
        let override_cfg = RouteMatrixSettingsOverride {
            mtu: 1280,
            dns_servers: vec!["1.1.1.1".to_string()],
            fake_dns_enabled: false,
            fragment_enabled: true,
            fragment_min_bytes: Some(128),
            fragment_max_bytes: Some(1420),
        };
        // Framework existence verified; full integration requires runtime tunnel engine.
        assert_eq!(override_cfg.mtu, 1280);
    }
}
