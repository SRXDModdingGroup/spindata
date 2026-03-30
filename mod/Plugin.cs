using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using HarmonyLib;
using SpinCore;
using SpinCore.Translation;
using SpinCore.UI;

namespace SpinDataRelay;

[BepInPlugin(Guid, Name, Version)]
[BepInDependency("xyz.bacur.plugins.spinstatus")]
[BepInDependency(SpinCorePlugin.Guid, SpinCorePlugin.Version)]
[BepInProcess("SpinRhythm.exe")]
public class Plugin : BaseUnityPlugin
{
    public const string Guid    = "spindata.relay";
    public const string Name    = "SpinData Relay";
    public const string Version = "1.0.0";

    internal static new ManualLogSource Logger;

    internal static ConfigEntry<string> ServerUrl;
    internal static ConfigEntry<string> Token;

    private Harmony _harmony;

    private void Awake()
    {
        Logger = base.Logger;

        ServerUrl = Config.Bind(
            "Connection", "ServerUrl", "ws://localhost:7701",
            "WebSocket URL of the spindata relay port");
        Token = Config.Bind(
            "Connection", "Token", "",
            "Match token provided by the tournament bot");

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

    private static void RegisterTranslations()
    {
        // Implicit string → TranslatedString operator sets English; other languages fall back to en.
        TranslationHelper.AddTranslation("SpinDataRelay_ModSettings",     "SpinData Relay");
        TranslationHelper.AddTranslation("SpinDataRelay_ConnectionHeader","Connection");
        TranslationHelper.AddTranslation("SpinDataRelay_ServerUrlLabel",  "Server URL");
        TranslationHelper.AddTranslation("SpinDataRelay_TokenLabel",      "Match Token");
        TranslationHelper.AddTranslation("SpinDataRelay_ConnectButton",   "Connect");
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
            UIHelper.CreateInputField(pageTransform, "Server URL Field",
                (_, newVal) => ServerUrl.Value = newVal);

            UIHelper.CreateLabel(pageTransform, "Token Label",
                "SpinDataRelay_TokenLabel");
            UIHelper.CreateInputField(pageTransform, "Token Field",
                (_, newVal) => Token.Value = newVal);

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
        };

        UIHelper.RegisterMenuInModSettingsRoot("SpinDataRelay_ModSettings", page);
    }
}
