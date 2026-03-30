using System.Threading;
using WebSocketSharp;

namespace SpinDataRelay;

internal static class RelayClient
{
    private static WebSocket _ws;
    private static string _url;
    private static bool _running;

    public static void Connect(string serverUrl, string token)
    {
        _url = $"{serverUrl}?token={token}";
        _running = true;
        StartConnection();
    }

    public static void Send(string message)
    {
        if (_ws?.ReadyState == WebSocketState.Open)
            _ws.SendAsync(message, null);
    }

    public static void Disconnect()
    {
        _running = false;
        _ws?.Close();
        _ws = null;
    }

    private static void StartConnection()
    {
        _ws = new WebSocket(_url);

        _ws.OnOpen += (sender, e) =>
            Plugin.Logger.LogInfo("Connected to spindata server");

        _ws.OnClose += (sender, e) =>
        {
            Plugin.Logger.LogWarning($"Disconnected from spindata server: {e.Reason}");
            ScheduleReconnect();
        };

        _ws.OnError += (sender, e) =>
            Plugin.Logger.LogError($"SpinData relay error: {e.Message}");

        _ws.ConnectAsync();
    }

    private static void ScheduleReconnect()
    {
        if (!_running) return;

        var thread = new Thread(() =>
        {
            Thread.Sleep(3000);
            if (_running) StartConnection();
        }) { IsBackground = true };

        thread.Start();
    }
}
