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
    public const string Version = "1.1.0";

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

        _harmony = new Harmony(Guid);
        _harmony.PatchAll(typeof(Patches));

        Logger.LogInfo($"{Name} {Version} loaded");
    }

    private void OnDestroy()
    {
        _harmony.UnpatchSelf();
        RelayClient.Disconnect();
    }

    private static GUIStyle MakeSymbolStyle(Color color) => new GUIStyle
    {
        fontSize  = 16,
        alignment = TextAnchor.UpperRight,
        normal    = { textColor = color },
    };

    private void OnGUI()
    {
        if (!ShowStatusDot.Value) return;

        // GUIStyle must be initialised inside OnGUI (GUI.skin not available earlier)
        if (_styleConnected == null)
        {
            _styleConnected    = MakeSymbolStyle(Color.green);
            _styleConnecting   = MakeSymbolStyle(new Color(1f, 0.75f, 0f)); // amber
            _styleDisconnected = MakeSymbolStyle(Color.red);
        }

        var status = RelayClient.Status;
        if (status != _lastStatus)
        {
            _lastStatus        = status;
            _statusChangeTime  = Time.unscaledTime;
        }

        float alpha = 1f;
        if (status == RelayClient.ConnectionStatus.Connected)
        {
            float elapsed = Time.unscaledTime - _statusChangeTime;
            alpha = 1f - Mathf.Clamp01((elapsed - FadeDelay) / FadeDuration);
        }

        if (alpha <= 0f) return;

        var (symbol, style) = status switch
        {
            RelayClient.ConnectionStatus.Connected  => ("✔", _styleConnected),
            RelayClient.ConnectionStatus.Connecting => ("↻", _styleConnecting),
            _                                       => ("✖", _styleDisconnected),
        };

        const int size   = 24;
        const int margin = 8;
        var prevColor = GUI.color;
        GUI.color = new Color(1f, 1f, 1f, alpha);
        GUI.Label(new Rect(Screen.width - size - margin, margin, size, size), symbol, style);
        GUI.color = prevColor;
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
