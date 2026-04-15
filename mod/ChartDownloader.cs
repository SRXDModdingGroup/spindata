using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;

namespace SpinDataRelay;

internal static class ChartDownloader
{
    private static readonly HttpClient Http = new HttpClient();

    public static bool IsDownloading { get; private set; }

    // check whether a chart with this fileReference is already in the local song library
    public static bool IsInstalled(string fileReference)
    {
        try
        {
            var enumerator = (GameSystemSingleton<TrackListSystem, TrackListSystemSettings>.Instance.AllTracks
                with { sorterSettings = TrackSorterSettings.DefaultValues }).GetEnumerator();
            int count = enumerator.GetTrackCount();
            for (int i = 0; i < count; i++)
            {
                var name = enumerator.Current?.UniqueName;
                if (!string.IsNullOrEmpty(name) && ExtractFileReference(name) == fileReference)
                    return true;
                enumerator.MoveNext();
            }
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogWarning($"ChartDownloader.IsInstalled: {ex.Message}");
        }
        return false;
    }

    // strips CUSTOM_ prefix and trailing _<suffix> to recover the SpinShare fileReference
    // e.g. "CUSTOM_myFileRef_123" → "myFileRef"
    private static string ExtractFileReference(string uniqueName)
    {
        var s = uniqueName;
        var lastUnderscore = s.LastIndexOf('_');
        if (lastUnderscore > 0)
            s = s.Remove(lastUnderscore);
        return s.Replace("CUSTOM_", string.Empty);
    }

    // download and install a chart from SpinShare by fileReference (or numeric songId as string)
    // returns true on success, false on failure
    public static async Task<bool> Download(string fileReference)
    {
        if (IsDownloading) return false;
        IsDownloading = true;
        try
        {
            // resolve zip URL from SpinShare API
            var apiJson = SimpleJSON.JSON.Parse(
                await Http.GetStringAsync($"https://spinsha.re/api/song/{fileReference}"));
            var zipUrl = apiJson["data"]["paths"]["zip"].Value;
            if (string.IsNullOrEmpty(zipUrl))
            {
                Plugin.Logger.LogError("ChartDownloader: no zip URL in API response");
                return false;
            }

            // download zip to a temp file then extract
            var tempPath = Path.GetTempFileName();
            try
            {
                var zipBytes = await Http.GetByteArrayAsync(zipUrl);
                File.WriteAllBytes(tempPath, zipBytes);
                ZipFile.ExtractToDirectory(tempPath, CustomAssetLoadingHelper.CUSTOM_DATA_PATH);
                return true;
            }
            finally
            {
                File.Delete(tempPath);
            }
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"ChartDownloader.Download: {ex.Message}");
            return false;
        }
        finally
        {
            IsDownloading = false;
        }
    }
}
