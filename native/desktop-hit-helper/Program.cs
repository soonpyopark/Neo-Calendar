using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;

namespace NeoCalendar.DesktopHit
{
    /// <summary>
    /// Hidden helper: answers whether a physical screen point is on a desktop icon.
    /// Protocol (named pipe, UTF-8 lines):
    ///   → HIT &lt;x&gt; &lt;y&gt;   (physical screen pixels)
    ///   ← ICON | EMPTY | ERR
    ///   → PING
    ///   ← PONG
    ///   → QUIT
    /// </summary>
    internal static class Program
    {
        private const uint LvmFirst = 0x1000;
        private const uint LvmHitTest = LvmFirst + 18;
        private const uint LvmSubItemHitTest = LvmFirst + 57;
        private const uint LvhtOnItemIcon = 0x0002;
        private const uint LvhtOnItemLabel = 0x0004;
        private const uint LvhtOnItemStateIcon = 0x0008;
        private const uint LvhtOnItem = LvhtOnItemIcon | LvhtOnItemLabel | LvhtOnItemStateIcon;

        private const uint ProcessVmOperation = 0x0008;
        private const uint ProcessVmRead = 0x0010;
        private const uint ProcessVmWrite = 0x0020;
        private const uint ProcessQueryLimitedInformation = 0x1000;

        private const uint MemCommit = 0x1000;
        private const uint MemReserve = 0x2000;
        private const uint MemRelease = 0x8000;
        private const uint PageReadWrite = 0x04;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct LVHITTESTINFO
        {
            public POINT Pt;
            public uint Flags;
            public int IItem;
            public int ISubItem;
            public int IGroup;
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindowW(string? lpClassName, string? lpWindowName);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindowExW(
            IntPtr hwndParent,
            IntPtr hwndChildAfter,
            string? lpszClass,
            string? lpszWindow);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr VirtualAllocEx(
            IntPtr hProcess,
            IntPtr lpAddress,
            UIntPtr dwSize,
            uint flAllocationType,
            uint flProtect);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualFreeEx(
            IntPtr hProcess,
            IntPtr lpAddress,
            UIntPtr dwSize,
            uint dwFreeType);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(
            IntPtr hProcess,
            IntPtr lpBaseAddress,
            byte[] lpBuffer,
            int nSize,
            out IntPtr lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadProcessMemory(
            IntPtr hProcess,
            IntPtr lpBaseAddress,
            [Out] byte[] lpBuffer,
            int dwSize,
            out IntPtr lpNumberOfBytesRead);

        [STAThread]
        private static int Main(string[] args)
        {
            var pipeName = "NeoCalendarDesktopHit";
            for (var i = 0; i < args.Length; i++)
            {
                if (args[i] == "--pipe" && i + 1 < args.Length)
                {
                    pipeName = args[i + 1];
                    break;
                }
            }

            try
            {
                using (var server = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous))
                {
                    while (true)
                    {
                        server.WaitForConnection();
                        using (var reader = new StreamReader(server, Encoding.UTF8, false, 256, true))
                        using (var writer = new StreamWriter(server, new UTF8Encoding(false), 256, true)
                        {
                            AutoFlush = true,
                            NewLine = "\n"
                        })
                        {
                            string line;
                            while ((line = reader.ReadLine()) != null)
                            {
                                var trimmed = line.Trim();
                                if (trimmed.Length == 0) continue;

                                if (string.Equals(trimmed, "QUIT", StringComparison.OrdinalIgnoreCase))
                                {
                                    writer.WriteLine("BYE");
                                    return 0;
                                }

                                if (string.Equals(trimmed, "PING", StringComparison.OrdinalIgnoreCase))
                                {
                                    writer.WriteLine("PONG");
                                    continue;
                                }

                                if (trimmed.StartsWith("HIT ", StringComparison.OrdinalIgnoreCase))
                                {
                                    var parts = trimmed.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                                    int x;
                                    int y;
                                    if (parts.Length >= 3
                                        && int.TryParse(parts[1], out x)
                                        && int.TryParse(parts[2], out y))
                                    {
                                        writer.WriteLine(IsDesktopIconAtPhysicalPoint(x, y) ? "ICON" : "EMPTY");
                                    }
                                    else
                                    {
                                        writer.WriteLine("ERR");
                                    }
                                    continue;
                                }

                                writer.WriteLine("ERR");
                            }
                        }

                        try
                        {
                            server.Disconnect();
                        }
                        catch
                        {
                            /* ignore */
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                try
                {
                    File.AppendAllText(
                        Path.Combine(Path.GetTempPath(), "neo-desktop-hit.log"),
                        DateTime.Now.ToString("o") + " " + ex + "\n");
                }
                catch
                {
                    /* ignore */
                }
                return 1;
            }
        }

        private static bool IsDesktopIconAtPhysicalPoint(int x, int y)
        {
            foreach (var list in CollectDesktopListViews())
            {
                RECT rect;
                if (!GetWindowRect(list, out rect)) continue;
                if (x < rect.Left || x >= rect.Right || y < rect.Top || y >= rect.Bottom) continue;
                if (HitTestListView(list, x, y)) return true;
            }
            return false;
        }

        private static List<IntPtr> CollectDesktopListViews()
        {
            var found = new List<IntPtr>();
            var seen = new HashSet<long>();

            Action<IntPtr> pushUnderDefView = defView =>
            {
                if (defView == IntPtr.Zero) return;
                var child = IntPtr.Zero;
                while (true)
                {
                    child = FindWindowExW(defView, child, "SysListView32", null);
                    if (child == IntPtr.Zero) break;
                    if (seen.Add(child.ToInt64())) found.Add(child);
                }
            };

            var progman = FindWindowW("Progman", null);
            if (progman != IntPtr.Zero)
            {
                pushUnderDefView(FindWindowExW(progman, IntPtr.Zero, "SHELLDLL_DefView", null));
            }

            EnumWindows((hWnd, lParam) =>
            {
                pushUnderDefView(FindWindowExW(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null));
                return true;
            }, IntPtr.Zero);

            return found;
        }

        private static bool HitTestListView(IntPtr listHwnd, int screenX, int screenY)
        {
            var pt = new POINT { X = screenX, Y = screenY };
            if (!ScreenToClient(listHwnd, ref pt))
            {
                RECT rect;
                if (!GetWindowRect(listHwnd, out rect)) return false;
                pt.X = screenX - rect.Left;
                pt.Y = screenY - rect.Top;
            }

            uint pid;
            GetWindowThreadProcessId(listHwnd, out pid);
            if (pid == 0) return false;

            var access = ProcessVmOperation | ProcessVmRead | ProcessVmWrite | ProcessQueryLimitedInformation;
            var process = OpenProcess(access, false, pid);
            if (process == IntPtr.Zero) return false;

            var remote = IntPtr.Zero;
            try
            {
                var info = new LVHITTESTINFO
                {
                    Pt = pt,
                    Flags = 0,
                    IItem = -1,
                    ISubItem = 0,
                    IGroup = 0
                };
                var size = Marshal.SizeOf(typeof(LVHITTESTINFO));
                remote = VirtualAllocEx(
                    process,
                    IntPtr.Zero,
                    new UIntPtr((uint)size),
                    MemCommit | MemReserve,
                    PageReadWrite);
                if (remote == IntPtr.Zero) return false;

                var bytes = StructureToBytes(info);
                IntPtr written;
                if (!WriteProcessMemory(process, remote, bytes, bytes.Length, out written)) return false;

                SendMessageW(listHwnd, LvmSubItemHitTest, IntPtr.Zero, remote);
                var outBuf = new byte[size];
                IntPtr read;
                if (!ReadProcessMemory(process, remote, outBuf, size, out read)) return false;
                var result = BytesToStructure<LVHITTESTINFO>(outBuf);
                if ((result.Flags & LvhtOnItem) != 0) return true;

                bytes = StructureToBytes(info);
                if (!WriteProcessMemory(process, remote, bytes, bytes.Length, out written)) return false;
                SendMessageW(listHwnd, LvmHitTest, IntPtr.Zero, remote);
                if (!ReadProcessMemory(process, remote, outBuf, size, out read)) return false;
                result = BytesToStructure<LVHITTESTINFO>(outBuf);
                return (result.Flags & LvhtOnItem) != 0;
            }
            finally
            {
                if (remote != IntPtr.Zero)
                {
                    VirtualFreeEx(process, remote, UIntPtr.Zero, MemRelease);
                }
                CloseHandle(process);
            }
        }

        private static byte[] StructureToBytes<T>(T value) where T : struct
        {
            var size = Marshal.SizeOf(typeof(T));
            var buffer = new byte[size];
            var ptr = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(value, ptr, false);
                Marshal.Copy(ptr, buffer, 0, size);
                return buffer;
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }
        }

        private static T BytesToStructure<T>(byte[] buffer) where T : struct
        {
            var size = Marshal.SizeOf(typeof(T));
            var ptr = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.Copy(buffer, 0, ptr, size);
                return (T)Marshal.PtrToStructure(ptr, typeof(T));
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }
        }
    }
}
