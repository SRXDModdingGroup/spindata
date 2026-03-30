using HarmonyLib;
using SimpleJSON;
using SpinStatus.Server;

namespace SpinDataRelay;

[HarmonyPatch(typeof(ServerBehavior), nameof(ServerBehavior.SendMessage))]
internal static class Patches
{
    // Intercepts every event SpinStatus broadcasts to its local WS clients
    // and forwards it to the spindata relay server.
    [HarmonyPostfix]
    static void Postfix(JSONObject json)
    {
        RelayClient.Send(json.ToString());
    }
}
