using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Data;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace QuickLaunch
{
    public partial class MainWindow : Window
    {
        private const int HotkeyId = 9001;
        private const uint ModControl = 0x0002;
        private const uint WmHotkey = 0x0312;
        private readonly List<LauncherItem> allItems = new List<LauncherItem>();
        private readonly DispatcherTimer searchDebounceTimer;
        private HwndSource source;
        private Forms.NotifyIcon trayIcon;
        private bool allowClose;
        private string pendingQuery = string.Empty;

        public ObservableCollection<LauncherItem> Results { get; private set; } = new ObservableCollection<LauncherItem>();
        public LauncherItem SelectedItem { get; private set; }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint virtualKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        public MainWindow()
        {
            InitializeComponent();
            DataContext = this;
            searchDebounceTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
            searchDebounceTimer.Tick += SearchDebounceTimer_Tick;
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            source = PresentationSource.FromVisual(this) as HwndSource;
            if (source != null)
            {
                source.AddHook(WindowMessageHook);
                RegisterHotKey(source.Handle, HotkeyId, ModControl, (uint)KeyInterop.VirtualKeyFromKey(Key.Space));
            }

            CreateTrayIcon();
            LoadItems();
            SearchBox.Focus();
            SearchBox.SelectAll();
        }

        private void LoadItems()
        {
            allItems.Clear();
            allItems.Add(new LauncherItem("Calculator", "Open the Windows calculator", "calc.exe", "=", "Applications", "#FF4C9AFF"));
            allItems.Add(new LauncherItem("Notepad", "Open a plain text editor", "notepad.exe", "N", "Applications", "#FF5EC6A8"));
            allItems.Add(new LauncherItem("Settings", "Open Windows settings", "ms-settings:", "⚙", "System", "#FFFFA45B"));
            allItems.Add(new LauncherItem("File Explorer", "Browse files and folders", "explorer.exe", "▣", "Folders", "#FF54B8E8"));
            allItems.Add(new LauncherItem("Desktop", "Open your desktop folder", Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "D", "Folders", "#FFB47CFF"));
            allItems.Add(new LauncherItem("Downloads", "Open your downloads folder", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"), "↓", "Folders", "#FFFF6F91"));
            allItems.Add(new LauncherItem("Sleep", "Put this PC to sleep", "rundll32.exe powrprof.dll,SetSuspendState 0,1,0", "Z", "System", "#FF8E8E93"));
            allItems.Add(new LauncherItem("Lock Screen", "Lock Windows", "rundll32.exe user32.dll,LockWorkStation", "L", "System", "#FF8E8E93"));

            AddStartMenuItems(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu));
            AddStartMenuItems(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu));
            ShowResults(string.Empty);
        }

        private void AddStartMenuItems(string root)
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
                return;

            try
            {
                foreach (string shortcut in Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories))
                {
                    string name = Path.GetFileNameWithoutExtension(shortcut);
                    if (!string.IsNullOrWhiteSpace(name) &&
                        allItems.All(item => !string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase)))
                        allItems.Add(new LauncherItem(name, "Application shortcut", shortcut, "A", "Applications", "#FF6675E8"));
                    if (allItems.Count >= 160)
                        break;
                }
            }
            catch (UnauthorizedAccessException)
            {
            }
            catch (IOException)
            {
            }
        }

        private void SearchBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            pendingQuery = SearchBox.Text;
            searchDebounceTimer.Stop();
            searchDebounceTimer.Start();
        }

        private void SearchDebounceTimer_Tick(object sender, EventArgs e)
        {
            searchDebounceTimer.Stop();
            ShowResults(pendingQuery);
        }

        private void ShowResults(string query)
        {
            Results.Clear();
            string trimmedQuery = (query ?? string.Empty).Trim();
            IEnumerable<LauncherItem> matches = allItems;

            if (!string.IsNullOrWhiteSpace(trimmedQuery))
            {
                string[] terms = trimmedQuery.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                matches = allItems.Where(item => terms.All(term =>
                    item.Name.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                    item.Description.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                    item.Path.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0))
                    .OrderBy(item => item.Name.StartsWith(trimmedQuery, StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                    .ThenBy(item => item.Category)
                    .ThenBy(item => item.Name);
            }

            foreach (LauncherItem item in matches.Take(24))
                Results.Add(item);

            if (!string.IsNullOrWhiteSpace(trimmedQuery) && IsCalculatorExpression(trimmedQuery))
            {
                string answer = Calculate(trimmedQuery);
                if (!string.IsNullOrEmpty(answer))
                    Results.Insert(0, new LauncherItem(answer, "Press Enter to copy the result", answer, "=", "Calculator", "#FF007AFF"));
            }

            if (!string.IsNullOrWhiteSpace(trimmedQuery))
                Results.Add(new LauncherItem("Search the web for \"" + trimmedQuery + "\"", "Open the default browser", "https://www.google.com/search?q=" + Uri.EscapeDataString(trimmedQuery), "↗", "Web", "#FF007AFF"));

            EmptyState.Visibility = Results.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            if (Results.Count > 0)
            {
                ResultsList.SelectedIndex = 0;
                SelectedItem = Results[0];
            }
            else
            {
                SelectedItem = null;
            }
            StatusTextFallback();
            NotifyPreviewChanged();
        }

        private bool IsCalculatorExpression(string query)
        {
            return query.Any(char.IsDigit) && query.All(c => char.IsDigit(c) || "+-*/%.() ^".IndexOf(c) >= 0);
        }

        private string Calculate(string expression)
        {
            try
            {
                string normalized = Regex.Replace(expression, @"(\d+(?:\.\d+)?)\s*\^\s*(\d+(?:\.\d+)?)", match =>
                    Math.Pow(
                        double.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture),
                        double.Parse(match.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture))
                    .ToString(System.Globalization.CultureInfo.InvariantCulture));
                object result = new DataTable().Compute(normalized, string.Empty);
                return Convert.ToString(result, System.Globalization.CultureInfo.InvariantCulture);
            }
            catch (Exception ex) when (ex is SyntaxErrorException || ex is EvaluateException || ex is InvalidCastException || ex is FormatException || ex is OverflowException)
            {
                return string.Empty;
            }
        }

        private void ResultsList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            SelectedItem = ResultsList.SelectedItem as LauncherItem;
            StatusTextFallback();
            NotifyPreviewChanged();
        }

        private void StatusTextFallback()
        {
            if (SelectedItem != null)
                WindowTitle = SelectedItem.Description;
        }

        private void NotifyPreviewChanged()
        {
            // Rebind the lightweight view model without introducing a framework dependency.
            DataContext = null;
            DataContext = this;
        }

        private string WindowTitle
        {
            set
            {
                if (value != null)
                    Title = "QuickLaunch - " + value;
            }
        }

        private void ResultsList_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if ((Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
                    RevealSelected();
                else
                    LaunchSelected();
                e.Handled = true;
            }
            else if (e.Key == Key.C && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                CopySelectedPath();
                e.Handled = true;
            }
        }

        private void ResultsList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            LaunchSelected();
        }

        private void Window_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                HideLauncher();
                e.Handled = true;
            }
            else if (e.Key == Key.Enter && SearchBox.IsKeyboardFocusWithin)
            {
                LaunchSelected();
                e.Handled = true;
            }
            else if (e.Key == Key.C && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                CopySelectedPath();
                e.Handled = true;
            }
        }

        private void LaunchSelected()
        {
            LauncherItem item = ResultsList.SelectedItem as LauncherItem;
            if (item == null)
                return;

            if (item.Category == "Calculator")
            {
                Clipboard.SetText(item.Name);
                HideLauncher();
                return;
            }

            try
            {
                if (item.Name == "Sleep")
                    Process.Start(new ProcessStartInfo("rundll32.exe", "powrprof.dll,SetSuspendState 0,1,0") { UseShellExecute = false });
                else if (item.Name == "Lock Screen")
                    Process.Start(new ProcessStartInfo("rundll32.exe", "user32.dll,LockWorkStation") { UseShellExecute = false });
                else
                    Process.Start(new ProcessStartInfo(item.Path) { UseShellExecute = true });
                HideLauncher();
            }
            catch (Exception ex) when (ex is InvalidOperationException || ex is System.ComponentModel.Win32Exception || ex is FileNotFoundException)
            {
                Title = "QuickLaunch - Could not open " + item.Name;
            }
        }

        private void RevealSelected()
        {
            LauncherItem item = ResultsList.SelectedItem as LauncherItem;
            if (item == null || !File.Exists(item.Path))
                return;

            Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + item.Path + "\"") { UseShellExecute = true });
        }

        private void CopySelectedPath()
        {
            LauncherItem item = ResultsList.SelectedItem as LauncherItem;
            if (item != null)
                Clipboard.SetText(item.Path);
        }

        private IntPtr WindowMessageHook(IntPtr handle, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (message == WmHotkey && wParam.ToInt32() == HotkeyId)
            {
                ToggleLauncher();
                handled = true;
            }
            return IntPtr.Zero;
        }

        private void ToggleLauncher()
        {
            if (IsVisible && IsActive)
                HideLauncher();
            else
            {
                Show();
                Activate();
                SearchBox.Focus();
                SearchBox.SelectAll();
            }
        }

        private void HideLauncher()
        {
            Hide();
            SearchBox.Clear();
            ShowResults(string.Empty);
        }

        private void CreateTrayIcon()
        {
            trayIcon = new Forms.NotifyIcon
            {
                Icon = System.Drawing.SystemIcons.Application,
                Text = "QuickLaunch",
                Visible = true
            };
            trayIcon.DoubleClick += delegate { ToggleLauncher(); };
            Forms.ContextMenuStrip menu = new Forms.ContextMenuStrip();
            menu.Items.Add("Show QuickLaunch", null, delegate { Show(); Activate(); SearchBox.Focus(); });
            menu.Items.Add(new Forms.ToolStripSeparator());
            menu.Items.Add("Exit", null, delegate { allowClose = true; Close(); });
            trayIcon.ContextMenuStrip = menu;
        }

        private void Window_Deactivated(object sender, EventArgs e)
        {
            if (IsVisible)
                HideLauncher();
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!allowClose)
            {
                e.Cancel = true;
                HideLauncher();
                return;
            }

            if (source != null)
            {
                UnregisterHotKey(source.Handle, HotkeyId);
                source.RemoveHook(WindowMessageHook);
            }
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
                trayIcon = null;
            }
        }
    }

    public sealed class LauncherItem
    {
        public LauncherItem(string name, string description, string path, string glyph, string category, string accentColor)
        {
            Name = name;
            Description = description;
            Path = path;
            Glyph = glyph;
            Category = category;
            AccentColor = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accentColor));
        }

        public string Name { get; private set; }
        public string Description { get; private set; }
        public string Path { get; private set; }
        public string Glyph { get; private set; }
        public string Category { get; private set; }
        public Brush AccentColor { get; private set; }
    }
}
