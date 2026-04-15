using System;
using System.Threading;
using WebSocketSharp;

namespace SpinDataRelay;

internal static class RelayClient
{
    public enum ConnectionStatus { Disconnected, Connecting, Connected }

    public static ConnectionStatus Status { get; private set; } = ConnectionStatus.Disconnected;

    // fired on the WS receive thread — handlers must be thread-safe
    public static event Action<string> MessageReceived;

    private static WebSocket _ws;
    private static string _url;
    private static bool _running;
    private static int _retryDelay = 3; // seconds, doubles on each failure up to MaxRetryDelay
    private const int MaxRetryDelay = 60;

    public static void Connect(string serverUrl, string token)
    {
        _url = $"{serverUrl}?token={token}";
        _running = true;
        _retryDelay = 3;
        Status = ConnectionStatus.Connecting;
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
        Status = ConnectionStatus.Disconnected;
    }

    private static void StartConnection()
    {
        _ws = new WebSocket(_url);

        _ws.OnOpen += (sender, e) =>
        {
            _retryDelay = 3;
            Status = ConnectionStatus.Connected;
            Plugin.Logger.LogInfo("Connected to spindata server");
        };

        _ws.OnClose += (sender, e) =>
        {
            Status = ConnectionStatus.Disconnected;
            Plugin.Logger.LogWarning($"Disconnected from spindata server: {e.Reason}");
            ScheduleReconnect();
        };

        _ws.OnMessage += (sender, e) =>
            MessageReceived?.Invoke(e.Data);

        _ws.OnError += (sender, e) =>
            Plugin.Logger.LogError($"SpinData relay error: {e.Message}");

        _ws.ConnectAsync();
    }

    private static void ScheduleReconnect()
    {
        if (!_running) return;

        int delay = _retryDelay;
        _retryDelay = System.Math.Min(_retryDelay * 2, MaxRetryDelay);

        Plugin.Logger.LogInfo($"Reconnecting in {delay}s...");

        var thread = new Thread(() =>
        {
            Thread.Sleep(delay * 1000);
            if (!_running) return;
            Status = ConnectionStatus.Connecting;
            StartConnection();
        }) { IsBackground = true };

        thread.Start();
    }
}
