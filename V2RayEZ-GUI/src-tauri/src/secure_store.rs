use std::path::Path;

#[cfg(windows)]
const DPAPI_MAGIC: &[u8] = b"V2RAYEZ-DPAPI\0";

pub fn protected_read(path: &Path) -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(path).map_err(display_err)?;
    #[cfg(windows)]
    {
        if let Some(ciphertext) = bytes.strip_prefix(DPAPI_MAGIC) {
            return dpapi_unprotect(ciphertext);
        }
    }
    Ok(bytes)
}

pub fn protected_write(path: &Path, data: &[u8]) -> Result<(), String> {
    #[cfg(windows)]
    let payload = {
        let mut out = DPAPI_MAGIC.to_vec();
        out.extend_from_slice(&dpapi_protect(data)?);
        out
    };
    #[cfg(not(windows))]
    let payload = data.to_vec();

    std::fs::write(path, payload).map_err(display_err)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path).map_err(display_err)?.permissions();
        permissions.set_mode(0o600);
        std::fs::set_permissions(path, permissions).map_err(display_err)?;
    }
    Ok(())
}

#[cfg(windows)]
fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, DATA_BLOB,
    };
    use windows_sys::Win32::System::Memory::LocalFree;

    unsafe {
        let input = DATA_BLOB {
            cbData: data.len().try_into().map_err(|_| "secret is too large")?,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB { cbData: 0, pbData: null_mut() };
        let ok = CryptProtectData(
            &input,
            null(),
            null(),
            null_mut(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        );
        if ok == 0 {
            return Err("Windows DPAPI encryption failed".into());
        }
        let protected = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(output.pbData as _);
        Ok(protected)
    }
}

#[cfg(windows)]
fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, DATA_BLOB,
    };
    use windows_sys::Win32::System::Memory::LocalFree;

    unsafe {
        let input = DATA_BLOB {
            cbData: data.len().try_into().map_err(|_| "secret is too large")?,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB { cbData: 0, pbData: null_mut() };
        let ok = CryptUnprotectData(
            &input,
            null_mut(),
            null(),
            null_mut(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        );
        if ok == 0 {
            return Err("Windows DPAPI decryption failed".into());
        }
        let plain = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(output.pbData as _);
        Ok(plain)
    }
}

fn display_err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
