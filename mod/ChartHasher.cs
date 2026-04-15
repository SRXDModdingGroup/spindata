using System;
using System.IO;
using System.Security.Cryptography;
using HarmonyLib;
using SpinCore.Utility;

namespace SpinDataRelay;

internal static class ChartHasher
{
    public static string LastHash { get; private set; }

    [HarmonyPatch(typeof(Track), nameof(Track.PlayTrack))]
    [HarmonyPostfix]
    private static void OnPlayTrack()
    {
        LastHash = null;
        try
        {
            var setup = Track.PlayHandle?.Setup;
            if (setup == null) return;

            var segment = setup.TrackDataSegmentForSingleTrackDataSetup;
            var metadata = segment.metadata;
            if (metadata == null) return;

            string path = SpinPaths.GetSrtbForChart(metadata);
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;

            byte[] bytes = File.ReadAllBytes(path);
            using var sha = SHA256.Create();
            byte[] hashBytes = sha.ComputeHash(bytes);
            LastHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"ChartHasher: {ex.Message}");
        }
    }
}
