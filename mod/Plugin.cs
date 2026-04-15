using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using HarmonyLib;
using SpinCore;
using SpinCore.Translation;
using SpinCore.UI;
using TMPro;
using UnityEngine;

namespace SpinDataRelay;

[BepInPlugin(Guid, Name, Version)]
[BepInDependency("xyz.bacur.plugins.spinstatus")]
[BepInDependency(SpinCorePlugin.Guid, SpinCorePlugin.Version)]
[BepInProcess("SpinRhythm.exe")]
public class Plugin : BaseUnityPlugin
{
    public const string Guid    = "spindata.relay";
    public const string Name    = "SpinData Relay";
    public const string Version = "1.3.0";

    internal static new ManualLogSource Logger;

    internal static ConfigEntry<string> ServerUrl;
    internal static ConfigEntry<string> Token;
    internal static ConfigEntry<bool> ShowStatusDot;

    private Harmony _harmony;
    private GUIStyle _styleConnected;
    private GUIStyle _styleConnecting;
    private GUIStyle _styleDisconnected;

    // Fade state
    private RelayClient.ConnectionStatus _lastStatus = RelayClient.ConnectionStatus.Disconnected;
    private float _statusChangeTime;
    private const float FadeDelay    = 2f;
    private const float FadeDuration = 1f;

    // Hash mismatch warning — set from WS thread, read in OnGUI (main thread)
    private static volatile bool _hashMismatchPending = false;
    private bool   _showingHashWarning = false;
    private float  _hashWarningTime;
    private const float HashWarningDuration = 8f;
    private GUIStyle _styleWarning;

    // Ready check panel — set from WS thread via volatile, drained in OnGUI
    private static volatile bool _readyCheckPending = false;
    private static string _pendingFileRef;
    private static string _pendingTitle;
    private bool   _showReadyPanel  = false;
    private bool   _chartInstalled  = false;
    private bool   _downloadDone    = false;  // volatile-safe: written on Task thread, read in OnGUI
    private bool   _downloadFailed  = false;
    private bool   _readySent       = false;
    private GUIStyle _stylePanelBg;
    private GUIStyle _stylePanelText;
    private GUIStyle _stylePanelBtn;

    private void Awake()
    {
        Logger = base.Logger;

        ServerUrl = Config.Bind(
            "Connection", "ServerUrl", "ws://207.180.220.125:7701",
            "WebSocket URL of the spindata relay port");
        Token = Config.Bind(
            "Connection", "Token", "",
            "Match token provided by the tournament bot");
        ShowStatusDot = Config.Bind(
            "UI", "ShowStatusDot", true,
            "Show the connection status indicator in the top-right corner of the screen");

        RegisterTranslations();
        RegisterSettingsPage();

        if (!string.IsNullOrWhiteSpace(Token.Value))
            RelayClient.Connect(ServerUrl.Value, Token.Value);
        else
            Logger.LogWarning("No token configured — open Mod Settings > SpinData Relay in-game to set one.");

        RelayClient.MessageReceived += OnRelayMessage;

        _harmony = new Harmony(Guid);
        _harmony.PatchAll(typeof(Patches));
        _harmony.PatchAll(typeof(ChartHasher));

        Logger.LogInfo($"{Name} {Version} loaded");
    }

    private void OnDestroy()
    {
        RelayClient.MessageReceived -= OnRelayMessage;
        _harmony.UnpatchSelf();
        RelayClient.Disconnect();
    }

    private static void OnRelayMessage(string raw)
    {
        try
        {
            var json = SimpleJSON.JSON.Parse(raw);
            switch (json["type"].Value)
            {
                case "chartHashMismatch":
                    _hashMismatchPending = true;
                    break;
                case "readyCheck":
                    _pendingFileRef    = json["fileReference"].Value;
                    _pendingTitle      = json["title"].Value;
                    _readyCheckPending = true;
                    break;
            }
        }
        catch { /* malformed message, ignore */ }
    }

    private static Texture2D MakeTex(int w, int h, Color col)
    {
        var tex = new Texture2D(w, h);
        var pixels = new Color[w * h];
        for (int i = 0; i < pixels.Length; i++) pixels[i] = col;
        tex.SetPixels(pixels);
        tex.Apply();
        return tex;
    }

    private static GUIStyle MakeSymbolStyle(Color color) => new GUIStyle
    {
        fontSize  = 16,
        alignment = TextAnchor.UpperRight,
        normal    = { textColor = color },
    };

    private void OnGUI()
    {
        // GUIStyle must be initialised inside OnGUI (GUI.skin not available earlier)
        if (_styleConnected == null)
        {
            _styleConnected    = MakeSymbolStyle(Color.green);
            _styleConnecting   = MakeSymbolStyle(new Color(1f, 0.75f, 0f)); // amber
            _styleDisconnected = MakeSymbolStyle(Color.red);
            _styleWarning = new GUIStyle
            {
                fontSize  = 18,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.UpperCenter,
                wordWrap  = true,
                normal    = { textColor = Color.red },
            };
            _stylePanelBg = new GUIStyle(GUI.skin.box)
            {
                normal = { background = MakeTex(1, 1, new Color(0f, 0f, 0f, 0.75f)) },
            };
            _stylePanelText = new GUIStyle(GUI.skin.label)
            {
                fontSize  = 16,
                wordWrap  = true,
                alignment = TextAnchor.MiddleCenter,
                normal    = { textColor = Color.white },
            };
            _stylePanelBtn = new GUIStyle(GUI.skin.button)
            {
                fontSize  = 16,
                fontStyle = FontStyle.Bold,
            };
        }

        // pick up mismatch flag set by the WS thread
        if (_hashMismatchPending)
        {
            _hashMismatchPending = false;
            _showingHashWarning  = true;
            _hashWarningTime     = Time.unscaledTime;
        }

        if (_showingHashWarning)
        {
            float elapsed = Time.unscaledTime - _hashWarningTime;
            if (elapsed >= HashWarningDuration)
            {
                _showingHashWarning = false;
            }
            else
            {
                float alpha = 1f - Mathf.Clamp01((elapsed - (HashWarningDuration - 1f)) / 1f);
                var prevColor = GUI.color;
                GUI.color = new Color(1f, 1f, 1f, alpha);
                GUI.Label(
                    new Rect(Screen.width / 2f - 200f, 60f, 400f, 60f),
                    "Wrong chart loaded!",
                    _styleWarning);
                GUI.color = prevColor;
            }
        }

        // pick up ready check from WS thread and check installation on main thread
        if (_readyCheckPending)
        {
            _readyCheckPending = false;
            _downloadDone      = false;
            _downloadFailed    = false;
            _readySent         = false;
            _chartInstalled    = ChartDownloader.IsInstalled(_pendingFileRef);
            _showReadyPanel    = true;
        }

        // drain async download results
        if (_downloadDone)
        {
            _downloadDone   = false;
            _chartInstalled = true;
            NotificationSystemGUI.AddMessage("Chart downloaded! Find it in the song list.", 6f);
        }
        if (_downloadFailed)
        {
            _downloadFailed = false;
            NotificationSystemGUI.AddMessage("Chart download failed. Check your connection.", 6f);
        }

        if (_showReadyPanel && !_readySent)
        {
            const float panelW = 420f;
            const float panelH = 160f;
            float px = (Screen.width  - panelW) / 2f;
            float py = (Screen.height - panelH) / 2f;
            var panelRect = new Rect(px, py, panelW, panelH);

            GUI.Box(panelRect, GUIContent.none, _stylePanelBg);

            GUILayout.BeginArea(new Rect(px + 16f, py + 12f, panelW - 32f, panelH - 24f));

            var title = string.IsNullOrEmpty(_pendingTitle) ? _pendingFileRef : _pendingTitle;
            GUILayout.Label($"Ready Check\n<b>{title}</b>", _stylePanelText);
            GUILayout.Space(8f);

            if (ChartDownloader.IsDownloading)
            {
                GUILayout.Label("Downloading chart...", _stylePanelText);
            }
            else if (_chartInstalled)
            {
                if (GUILayout.Button("Ready!", _stylePanelBtn))
                {
                    _readySent = true;
                    RelayClient.Send(SimpleJSON.JSON.Parse("{\"type\":\"playerReady\"}").ToString());
                    NotificationSystemGUI.AddMessage("Signalled ready!", 3f);
                }
            }
            else
            {
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Download chart", _stylePanelBtn))
                {
                    var fileRef = _pendingFileRef;
                    _ = System.Threading.Tasks.Task.Run(async () =>
                    {
                        bool ok = await ChartDownloader.Download(fileRef);
                        if (ok) _downloadDone   = true;
                        else    _downloadFailed = true;
                    });
                }
                if (GUILayout.Button("Skip", _stylePanelBtn))
                    _showReadyPanel = false;
                GUILayout.EndHorizontal();
            }

            GUILayout.EndArea();
        }

        if (!ShowStatusDot.Value) return;

        var status = RelayClient.Status;
        if (status != _lastStatus)
        {
            _lastStatus        = status;
            _statusChangeTime  = Time.unscaledTime;
        }

        float dotAlpha = 1f;
        if (status == RelayClient.ConnectionStatus.Connected)
        {
            float elapsed = Time.unscaledTime - _statusChangeTime;
            dotAlpha = 1f - Mathf.Clamp01((elapsed - FadeDelay) / FadeDuration);
        }

        if (dotAlpha <= 0f) return;

        var (symbol, style) = status switch
        {
            RelayClient.ConnectionStatus.Connected  => ("✔", _styleConnected),
            RelayClient.ConnectionStatus.Connecting => ("↻", _styleConnecting),
            _                                       => ("✖", _styleDisconnected),
        };

        const int size   = 24;
        const int margin = 8;
        var prev = GUI.color;
        GUI.color = new Color(1f, 1f, 1f, dotAlpha);
        GUI.Label(new Rect(Screen.width - size - margin, margin, size, size), symbol, style);
        GUI.color = prev;
    }

    private static void RegisterTranslations()
    {
        // Implicit string → TranslatedString operator sets English; other languages fall back to en.
        TranslationHelper.AddTranslation("SpinDataRelay_ModSettings",     "SpinData Relay");
        TranslationHelper.AddTranslation("SpinDataRelay_ConnectionHeader","Connection");
        TranslationHelper.AddTranslation("SpinDataRelay_ServerUrlLabel",  "Server URL");
        TranslationHelper.AddTranslation("SpinDataRelay_TokenLabel",      "Match Token");
        TranslationHelper.AddTranslation("SpinDataRelay_ConnectButton",   "Connect");
        TranslationHelper.AddTranslation("SpinDataRelay_UIHeader",        "Interface");
        TranslationHelper.AddTranslation("SpinDataRelay_ShowStatusDot",   "Show Connection Status Indicator");
    }

    private static void RegisterSettingsPage()
    {
        var page = UIHelper.CreateCustomPage("SpinDataRelaySettings");

        page.OnPageLoad += pageTransform =>
        {
            UIHelper.CreateSectionHeader(pageTransform, "Connection Header",
                "SpinDataRelay_ConnectionHeader", false);

            UIHelper.CreateLabel(pageTransform, "Server URL Label",
                "SpinDataRelay_ServerUrlLabel");
            var serverUrlField = UIHelper.CreateInputField(pageTransform, "Server URL Field",
                (_, newVal) => ServerUrl.Value = newVal);
            serverUrlField.InputField.text = ServerUrl.Value;

            UIHelper.CreateLabel(pageTransform, "Token Label",
                "SpinDataRelay_TokenLabel");
            var tokenField = UIHelper.CreateInputField(pageTransform, "Token Field",
                (_, newVal) => Token.Value = newVal);
            tokenField.InputField.text = Token.Value;

            UIHelper.CreateButton(pageTransform, "Connect Button",
                "SpinDataRelay_ConnectButton",
                () =>
                {
                    RelayClient.Disconnect();
                    if (!string.IsNullOrWhiteSpace(Token.Value))
                        RelayClient.Connect(ServerUrl.Value, Token.Value);
                    else
                        Logger.LogWarning("Cannot connect: no token set.");
                });

            UIHelper.CreateSectionHeader(pageTransform, "UI Header",
                "SpinDataRelay_UIHeader", false);

            UIHelper.CreateLargeToggle(pageTransform, "Show Status Indicator Toggle",
                "SpinDataRelay_ShowStatusDot",
                ShowStatusDot.Value,
                val => ShowStatusDot.Value = val);
        };

        UIHelper.RegisterMenuInModSettingsRoot("SpinDataRelay_ModSettings", page);

        UIHelper.RegisterGroupInQuickModSettings(panelTransform =>
        {
            var section = UIHelper.CreateGroup(panelTransform, "SpinDataRelay Section");
            UIHelper.CreateSectionHeader(section.Transform, "Quick Header",
                "SpinDataRelay_ModSettings", false);

            UIHelper.CreateLabel(section.Transform, "Quick Token Label",
                "SpinDataRelay_TokenLabel");
            var quickTokenField = UIHelper.CreateInputField(section.Transform, "Quick Token Field",
                (_, newVal) => Token.Value = newVal);
            quickTokenField.InputField.text = Token.Value;

            UIHelper.CreateButton(section.Transform, "Quick Connect Button",
                "SpinDataRelay_ConnectButton",
                () =>
                {
                    RelayClient.Disconnect();
                    if (!string.IsNullOrWhiteSpace(Token.Value))
                        RelayClient.Connect(ServerUrl.Value, Token.Value);
                    else
                        Logger.LogWarning("Cannot connect: no token set.");
                });
        });
    }
}
