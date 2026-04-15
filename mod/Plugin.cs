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
    public const string Version = "1.2.0";

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
            if (json["type"].Value == "chartHashMismatch")
                _hashMismatchPending = true;
        }
        catch { /* malformed message, ignore */ }
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
