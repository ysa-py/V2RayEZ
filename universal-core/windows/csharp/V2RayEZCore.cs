using System;
using System.Runtime.InteropServices;

namespace V2RayEZ.Core
{
    /// <summary>
    /// C# P/Invoke wrapper over universal-core FFI.
    /// Memory safety: all char* returned from native must be freed via
    /// v2rayez_free_string. This wrapper frees immediately after marshaling.
    /// </summary>
    public class V2RayEZCoreBinding
    {
        private IntPtr _handle;

        public V2RayEZCoreBinding()
        {
            _handle = v2rayez_core_init();
        }

        ~V2RayEZCoreBinding()
        {
            if (_handle != IntPtr.Zero)
            {
                v2rayez_core_shutdown(_handle);
                _handle = IntPtr.Zero;
            }
        }

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr v2rayez_core_init();

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern void v2rayez_core_shutdown(IntPtr handle);

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr v2rayez_core_status(IntPtr handle);

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr v2rayez_core_start(IntPtr handle, string requestJson);

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr v2rayez_core_stop(IntPtr handle);

        [DllImport("v2rayez_universal_core.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern void v2rayez_free_string(IntPtr s);

        public string Status()
        {
            IntPtr cstr = v2rayez_core_status(_handle);
            try { return cstr != IntPtr.Zero ? Marshal.PtrToStringAnsi(cstr) : "{}"; }
            finally { if (cstr != IntPtr.Zero) v2rayez_free_string(cstr); }
        }

        public string Start(string requestJson)
        {
            IntPtr resp = v2rayez_core_start(_handle, requestJson);
            try { return resp != IntPtr.Zero ? Marshal.PtrToStringAnsi(resp) : "{}"; }
            finally { if (resp != IntPtr.Zero) v2rayez_free_string(resp); }
        }

        public string Stop()
        {
            IntPtr resp = v2rayez_core_stop(_handle);
            try { return resp != IntPtr.Zero ? Marshal.PtrToStringAnsi(resp) : "{}"; }
            finally { if (resp != IntPtr.Zero) v2rayez_free_string(resp); }
        }
    }
}
